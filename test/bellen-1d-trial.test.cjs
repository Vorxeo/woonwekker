'use strict';
/**
 * Mocked Mollie path: mandate → 1-day trial Bellen → conversion / fail-closed.
 * No live charges. Run: npm test
 */
const { describe, it, before, after, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.MOLLIE_API_KEY = 'test_mock_bellen_1d_trial';
process.env.WW_ENTITLEMENT_SECRET = 'test-entitlement-secret-bellen-1d';

const gate = require('../lib/ww-gate.cjs');
const {
  setMollieRequestForTests,
  grantIfPaid,
  resolveEntitlement,
  signEntitlement,
  cookieHeader,
  cookieMaxAgeSeconds,
  computeEntitlementExp,
  tomorrowYmd,
  trialEndMs,
  parseMollieDateEndMs,
  addOneCalendarMonth,
  COOKIE,
} = gate;

function ymdPlus(days, from = new Date()) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + days));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function reqWithCookie(token) {
  return {
    headers: {
      host: 'localhost:4174',
      cookie: token ? `${COOKIE}=${encodeURIComponent(token)}` : '',
    },
  };
}

describe('Bellen 1-day trial → subscription', () => {
  afterEach(() => {
    setMollieRequestForTests(null);
  });

  it('1) checkout first payment (mandate) → grantIfPaid creates sub startDate=tomorrow, plan=bellen, trial exp ~+1 day', async () => {
    const startDate = tomorrowYmd();
    let createdBody = null;
    setMollieRequestForTests(async (method, apiPath, body) => {
      if (method === 'GET' && /\/subscriptions/.test(apiPath)) {
        return { _embedded: { subscriptions: [] } };
      }
      if (method === 'POST' && /\/subscriptions$/.test(apiPath)) {
        createdBody = body;
        return {
          id: 'sub_trial1',
          status: 'pending',
          startDate: body.startDate,
          nextPaymentDate: body.startDate,
          amount: body.amount,
          interval: body.interval,
          description: body.description,
        };
      }
      throw new Error('unexpected ' + method + ' ' + apiPath);
    });

    const payment = {
      id: 'tr_first1',
      status: 'paid',
      customerId: 'cst_1',
      amount: { currency: 'EUR', value: '0.00' },
      sequenceType: 'first',
      paidAt: new Date().toISOString(),
    };
    const payload = await grantIfPaid(payment);
    assert.ok(payload, 'grant payload');
    assert.equal(payload.plan, 'bellen');
    assert.equal(payload.customerId, 'cst_1');
    assert.equal(payload.subscriptionId, 'sub_trial1');
    assert.equal(payload.trial, true);
    assert.ok(createdBody, 'subscription create called');
    assert.equal(createdBody.amount.value, '18.50');
    assert.equal(createdBody.interval, '1 month');
    assert.equal(createdBody.description, 'Bellen');
    assert.equal(createdBody.startDate, startDate);
    const expectedExp = trialEndMs(startDate);
    assert.equal(payload.exp, expectedExp);
    const maxAge = cookieMaxAgeSeconds(payload.exp);
    assert.ok(maxAge > 60 && maxAge <= 2 * 24 * 60 * 60 + 5, 'Max-Age aligned to trial window, got ' + maxAge);
  });

  it('2) before trial end: resolveEntitlement still bellen; cookie Max-Age coherent', async () => {
    const startDate = tomorrowYmd();
    const pendingSub = {
      id: 'sub_trial1',
      status: 'pending',
      startDate,
      nextPaymentDate: startDate,
      amount: { currency: 'EUR', value: '18.50' },
      interval: '1 month',
    };
    setMollieRequestForTests(async (method, apiPath) => {
      if (method === 'GET' && /\/subscriptions/.test(apiPath)) {
        return { _embedded: { subscriptions: [pendingSub] } };
      }
      throw new Error('unexpected ' + method + ' ' + apiPath);
    });

    const token = signEntitlement({
      plan: 'bellen',
      source: 'mollie',
      customerId: 'cst_1',
      subscriptionId: 'sub_trial1',
      paymentId: 'tr_first1',
      trial: true,
      exp: trialEndMs(startDate),
    });
    const ent = await resolveEntitlement(reqWithCookie(token), { refresh: true });
    assert.equal(ent.plan, 'bellen');
    assert.ok(ent.payload);
    assert.equal(ent.payload.plan, 'bellen');
    assert.ok(ent.refreshed);
    assert.ok(ent.setCookie, 're-issues cookie');
    assert.match(ent.setCookie, /Max-Age=(\d+)/);
    const age = Number(ent.setCookie.match(/Max-Age=(\d+)/)[1]);
    assert.ok(age > 60 && age <= 2 * 24 * 60 * 60 + 5, 'Max-Age within trial, got ' + age);
    assert.equal(ent.payload.exp, trialEndMs(startDate));
  });

  it('3) at/after trial end with active sub: computeEntitlementExp uses nextPaymentDate / anniversary; still bellen', async () => {
    const next = ymdPlus(30);
    const activeSub = {
      id: 'sub_live1',
      status: 'active',
      startDate: ymdPlus(-1),
      nextPaymentDate: next,
      amount: { currency: 'EUR', value: '18.50' },
      interval: '1 month',
    };
    const exp = computeEntitlementExp({ subscription: activeSub, fromDate: new Date() });
    assert.equal(exp, parseMollieDateEndMs(next));
    assert.ok(exp - Date.now() > 20 * 24 * 60 * 60 * 1000, 'anniversary window ~1 month');

    setMollieRequestForTests(async (method, apiPath) => {
      if (method === 'GET' && /\/subscriptions/.test(apiPath)) {
        return { _embedded: { subscriptions: [activeSub] } };
      }
      throw new Error('unexpected');
    });

    // Expired trial cookie + still-active sub → refresh to anniversary
    const expiredTrial = signEntitlement({
      plan: 'bellen',
      source: 'mollie',
      customerId: 'cst_1',
      subscriptionId: 'sub_live1',
      trial: true,
      exp: Date.now() - 1000,
    });
    const ent = await resolveEntitlement(reqWithCookie(expiredTrial), { refresh: true });
    assert.equal(ent.plan, 'bellen');
    assert.equal(ent.payload.exp, parseMollieDateEndMs(next));
    assert.equal(ent.payload.trial, false);
    assert.ok(ent.setCookie);
    const age = Number(ent.setCookie.match(/Max-Age=(\d+)/)[1]);
    assert.ok(age > 20 * 24 * 60 * 60, 'Max-Age tracks nextPaymentDate');
  });

  it('4a) cancelled subscription → fail-closed kijken + clear ww_bellen', async () => {
    setMollieRequestForTests(async (method, apiPath) => {
      if (method === 'GET' && /\/subscriptions/.test(apiPath)) {
        return {
          _embedded: {
            subscriptions: [{ id: 'sub_x', status: 'canceled', startDate: tomorrowYmd() }],
          },
        };
      }
      throw new Error('unexpected');
    });
    const token = signEntitlement({
      plan: 'bellen',
      source: 'mollie',
      customerId: 'cst_1',
      subscriptionId: 'sub_x',
      exp: trialEndMs(tomorrowYmd()),
    });
    const ent = await resolveEntitlement(reqWithCookie(token), { refresh: true });
    assert.equal(ent.plan, 'kijken');
    assert.equal(ent.payload, null);
    assert.ok(ent.setCookie);
    assert.match(ent.setCookie, /Max-Age=0/);
  });

  it('4b) missing subscription → fail-closed kijken + clear ww_bellen', async () => {
    setMollieRequestForTests(async (method, apiPath) => {
      if (method === 'GET' && /\/subscriptions/.test(apiPath)) {
        return { _embedded: { subscriptions: [] } };
      }
      throw new Error('unexpected');
    });
    const token = signEntitlement({
      plan: 'bellen',
      source: 'mollie',
      customerId: 'cst_missing',
      exp: Date.now() + 3600_000,
    });
    const ent = await resolveEntitlement(reqWithCookie(token), { refresh: true });
    assert.equal(ent.plan, 'kijken');
    assert.match(ent.setCookie || '', /Max-Age=0/);
  });

  it('4c) no MOLLIE_API_KEY → mollieEnabled false; checkout path fail-closed (grant skips sub)', async () => {
    const prev = process.env.MOLLIE_API_KEY;
    delete process.env.MOLLIE_API_KEY;
    try {
      assert.equal(gate.mollieEnabled(), false);
      const payload = await grantIfPaid({
        id: 'tr_x',
        status: 'paid',
        customerId: 'cst_1',
      });
      // Paid without Mollie key: still builds payload from payment but no live sub create
      assert.ok(payload);
      assert.equal(payload.plan, 'bellen');
      assert.equal(payload.subscriptionId, undefined);
    } finally {
      process.env.MOLLIE_API_KEY = prev;
    }
  });

  it('5) copy gate: no leftover 14 money-back / geen trial / no trial in pricing strings', () => {
    const contentPath = path.join(__dirname, '..', 'dist', 'content.js');
    const s = fs.readFileSync(contentPath, 'utf8');
    const forbidden = [
      /14 dagen geld-terug/i,
      /14-day money-back/i,
      /14 días de devolución/i,
      /14 días devolución/i,
      /14 dni zwrotu/i,
      /14 dias de devolução/i,
      /\bgeen trial\b/i,
      /\bno trial\b/i,
      /\bzonder trial\b/i,
      /\bsin trial\b/i,
      /\bbez trialu\b/i,
      /\bsem trial\b/i,
    ];
    const hits = [];
    for (const re of forbidden) {
      const m = s.match(re);
      if (m) hits.push(m[0]);
    }
    assert.deepEqual(hits, [], 'forbidden copy leftovers: ' + hits.join(', '));

    // Pricing keys must mention 1-day trial / localized equivalent
    for (const key of ['pricingIntro', 'bellenFeat6', 'pricingNote', 'riskBadge']) {
      const re = new RegExp(`"${key}":\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'g');
      let m;
      let n = 0;
      while ((m = re.exec(s))) {
        n++;
        const v = m[1];
        assert.ok(
          /1 dag gratis|1 day free|1 día gratis|1 dzień za darmo|1 dia grátis/i.test(v),
          `${key} locale missing 1-day trial: ${v.slice(0, 80)}`
        );
      }
      assert.equal(n, 5, key + ' should exist in 5 locales');
    }
  });
});
