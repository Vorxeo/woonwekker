'use strict';
/**
 * iDEAL first payment is €18.50 only when SEPA Direct Debit can recur.
 * No live charges. Card €0 trial path stays.
 */
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.MOLLIE_API_KEY = 'test_mock_bellen_ideal_sepa';
process.env.WW_ENTITLEMENT_SECRET = 'test-entitlement-secret-bellen-ideal';

const gate = require('../lib/ww-gate.cjs');
const checkout = require('../api/checkout.js');
const { setMollieRequestForTests, grantIfPaid, addOneCalendarMonth, tomorrowYmd } = gate;

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

describe('Bellen iDEAL + SEPA', () => {
  afterEach(() => setMollieRequestForTests(null));

  it('refuses iDEAL when recurring methods have no directdebit, and creates no payment', async () => {
    const calls = [];
    setMollieRequestForTests(async (method, apiPath) => {
      calls.push(method + ' ' + apiPath);
      if (method === 'GET' && apiPath.startsWith('/methods?')) {
        return { _embedded: { methods: [{ id: 'creditcard' }] } };
      }
      throw new Error('should not call ' + method + ' ' + apiPath);
    });
    const res = mockRes();
    await checkout({ method: 'POST', headers: { host: 'localhost:4174' }, body: { method: 'ideal', email: 'a@b.c' } }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'sepa_unavailable');
    assert.equal(calls.length, 1);
    assert.equal(calls.some((c) => c.startsWith('POST /payments')), false);
    assert.equal(calls.some((c) => c.startsWith('POST /customers')), false);
  });

  it('iDEAL with SEPA creates a €18.50 first payment, method ideal, no trial', async () => {
    let payBody = null;
    setMollieRequestForTests(async (method, apiPath, body) => {
      if (method === 'GET' && apiPath.startsWith('/methods?')) {
        return { _embedded: { methods: [{ id: 'creditcard' }, { id: 'directdebit' }] } };
      }
      if (method === 'POST' && apiPath === '/customers') return { id: 'cst_ideal' };
      if (method === 'POST' && apiPath === '/payments') {
        payBody = body;
        return { id: 'tr_ideal', _links: { checkout: { href: 'https://pay.example/ideal' } } };
      }
      throw new Error('unexpected ' + method + ' ' + apiPath);
    });
    const res = mockRes();
    await checkout({ method: 'POST', headers: { host: 'localhost:4174' }, body: { method: 'ideal' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(payBody.amount.value, '18.50');
    assert.equal(payBody.method, 'ideal');
    assert.equal(payBody.sequenceType, 'first');
    assert.equal(payBody.metadata.billing, 'ideal-sepa');
    assert.equal(payBody.metadata.trial, '0');
  });

  it('card checkout stays €0 with no method, even if SEPA is off', async () => {
    let payBody = null;
    const calls = [];
    setMollieRequestForTests(async (method, apiPath, body) => {
      calls.push(method + ' ' + apiPath.split('?')[0]);
      if (method === 'POST' && apiPath === '/customers') return { id: 'cst_card' };
      if (method === 'POST' && apiPath === '/payments') {
        payBody = body;
        return { id: 'tr_card', _links: { checkout: { href: 'https://pay.example/card' } } };
      }
      throw new Error('unexpected ' + method + ' ' + apiPath);
    });
    const res = mockRes();
    await checkout({ method: 'POST', headers: { host: 'localhost:4174' }, body: { email: 'a@b.c' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(payBody.amount.value, '0.00');
    assert.equal(payBody.method, undefined);
    assert.equal(payBody.metadata.billing, 'card-trial');
    assert.equal(payBody.metadata.trial, '1d');
    assert.equal(calls.some((c) => c.startsWith('GET /methods')), false);
  });

  it('paid iDEAL grants Bellen with subscription start +1 month, not tomorrow', async () => {
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
      paidAt: '2026-09-30T12:00:00.000Z',
      metadata: { billing: 'ideal-sepa' },
    });
    assert.equal(ent, null);
  });
});
