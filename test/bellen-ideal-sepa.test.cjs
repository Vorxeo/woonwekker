'use strict';
/**
 * Checkout fails closed unless WW_CHECKOUT_PROVIDER=mollie and a Mollie key is present.
 * Both consents are required. The iDEAL first-payment path is retired; grantIfPaid still
 * understands a paid iDEAL metadata for any in-flight payments.
 */
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.MOLLIE_API_KEY = 'test_mock_bellen_ideal_sepa';
process.env.WW_ENTITLEMENT_SECRET = 'test-entitlement-secret-bellen-ideal';
delete process.env.WW_CHECKOUT_PROVIDER;

const gate = require('../lib/ww-gate.cjs');
const checkout = require('../api/checkout.js');
const { setMollieRequestForTests, grantIfPaid, addOneCalendarMonth, tomorrowYmd, checkoutAvailable } = gate;

function ymdUtc(input) {
  const d = input instanceof Date ? input : new Date(input);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function mockRes() {
  const res = {
    statusCode: 0,
    body: null,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    end(raw) { this.body = raw ? JSON.parse(raw) : null; },
  };
  return res;
}

const bothConsents = { consentTerms: true, consentImmediateStart: true, email: 'a@b.c' };

describe('Bellen checkout (fail-closed + consents)', () => {
  afterEach(() => {
    setMollieRequestForTests(null);
    delete process.env.WW_CHECKOUT_PROVIDER;
  });

  it('rejects a request without both unticked-by-default consents', async () => {
    const res = mockRes();
    await checkout({ method: 'POST', headers: { host: 'localhost:4174' }, body: { email: 'a@b.c' } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'consent_required');
    assert.deepEqual(res.body.missing, ['consentTerms', 'consentImmediateStart']);
  });

  it('rejects when only one consent is set', async () => {
    const res = mockRes();
    await checkout({ method: 'POST', headers: { host: 'localhost:4174' }, body: { consentTerms: true } }, res);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body.missing, ['consentImmediateStart']);
  });

  it('closes new subscriptions when the provider switch is off (even with a Mollie key)', async () => {
    assert.equal(checkoutAvailable(), false);
    const calls = [];
    setMollieRequestForTests(async (method, apiPath) => {
      calls.push(method + ' ' + apiPath);
      throw new Error('should not call Mollie');
    });
    const res = mockRes();
    await checkout({ method: 'POST', headers: { host: 'localhost:4174' }, body: bothConsents }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'subscriptions_unavailable');
    assert.match(res.body.message, /temporarily unavailable/i);
    assert.equal(/mollie/i.test(JSON.stringify(res.body)), false, 'response must not name a provider');
    assert.equal(calls.length, 0);
  });

  it('opens only when WW_CHECKOUT_PROVIDER=mollie and a key is present; stores consent metadata', async () => {
    process.env.WW_CHECKOUT_PROVIDER = 'mollie';
    assert.equal(checkoutAvailable(), true);
    let payBody = null;
    setMollieRequestForTests(async (method, apiPath, body) => {
      if (method === 'POST' && apiPath === '/customers') return { id: 'cst_card' };
      if (method === 'POST' && apiPath === '/payments') {
        payBody = body;
        return { id: 'tr_card', _links: { checkout: { href: 'https://pay.example/card' } } };
      }
      throw new Error('unexpected ' + method + ' ' + apiPath);
    });
    const res = mockRes();
    await checkout({ method: 'POST', headers: { host: 'localhost:4174' }, body: bothConsents }, res);
    assert.equal(res.statusCode, 200);
    assert.match(res.body.url, /^https:\/\//);
    assert.equal(payBody.amount.value, '0.00');
    assert.equal(payBody.metadata.consentTerms, true);
    assert.equal(payBody.metadata.consentImmediateStart, true);
    assert.equal(payBody.metadata.termsVersion, '1.0');
    assert.ok(payBody.metadata.consentAt);
  });

  it('paid iDEAL (legacy in-flight) grants Bellen with subscription start +1 month, not tomorrow', async () => {
    const paidAt = '2026-09-30T12:00:00.000Z';
    const expected = ymdUtc(addOneCalendarMonth(paidAt));
    let created = null;
    setMollieRequestForTests(async (method, apiPath, body) => {
      if (method === 'GET' && /\/subscriptions/.test(apiPath)) return { _embedded: { subscriptions: [] } };
      if (method === 'POST' && /\/subscriptions$/.test(apiPath)) {
        created = body;
        return { id: 'sub_ideal', status: 'pending', startDate: body.startDate, nextPaymentDate: body.startDate, amount: body.amount };
      }
      throw new Error('unexpected ' + method + ' ' + apiPath);
    });
    const ent = await grantIfPaid({
      id: 'tr_ideal_paid',
      status: 'paid',
      method: 'ideal',
      customerId: 'cst_ideal',
      amount: { currency: 'EUR', value: '18.50' },
      sequenceType: 'first',
      paidAt,
      metadata: { billing: 'ideal-sepa', trial: '0' },
    });
    assert.equal(created.amount.value, '18.50');
    assert.equal(created.startDate, expected);
    assert.notEqual(created.startDate, tomorrowYmd(paidAt));
    assert.equal(ent.plan, 'bellen');
    assert.equal(ent.trial, false);
    assert.equal(ent.subscriptionId, 'sub_ideal');
  });

  it('paid iDEAL with no subscription returns null (no Bellen cookie)', async () => {
    setMollieRequestForTests(async (method, apiPath) => {
      if (method === 'GET' && /\/subscriptions/.test(apiPath)) return { _embedded: { subscriptions: [] } };
      if (method === 'POST' && /\/subscriptions$/.test(apiPath)) throw new Error('sepa refused');
      throw new Error('unexpected ' + method + ' ' + apiPath);
    });
    const ent = await grantIfPaid({
      id: 'tr_ideal_fail',
      status: 'paid',
      method: 'ideal',
      customerId: 'cst_ideal',
      amount: { currency: 'EUR', value: '18.50' },
      sequenceType: 'first',
      paidAt: '2026-09-30T12:00:00.000Z',
      metadata: { billing: 'ideal-sepa', trial: '0' },
    });
    assert.equal(ent, null);
  });
});
