'use strict';
/**
 * Bellen Resend emails B / C / D — mocked Mollie + Resend. No live HTTP.
 * Run: npm test
 */
const { describe, it, afterEach, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.MOLLIE_API_KEY = 'test_mock_bellen_resend_bcd';
process.env.WW_ENTITLEMENT_SECRET = 'test-entitlement-secret-bellen-resend';
process.env.WW_PUBLIC_BASE = 'https://www.woonwekker.nl';

const gate = require('../lib/ww-gate.cjs');
const mail = require('../lib/ww-bellen-mail.cjs');
const webhook = require('../api/mollie/webhook.js');
const {
  setMollieRequestForTests,
  grantIfPaid,
  tomorrowYmd,
} = gate;
const { setResendRequestForTests, resendFrom } = mail;

function mockRes() {
  const res = {
    statusCode: 0,
    body: null,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(raw) {
      this.raw = raw;
      if (raw && String(this.headers['Content-Type'] || '').includes('json')) {
        try {
          this.body = JSON.parse(raw);
        } catch {
          this.body = raw;
        }
      } else {
        this.body = raw;
      }
    },
  };
  return res;
}

describe('Bellen Resend B/C/D', () => {
  let prevResendKey;
  let resendCalls;

  beforeEach(() => {
    prevResendKey = process.env.RESEND_API_KEY;
    resendCalls = [];
    setResendRequestForTests(async (method, hostname, pathName, opts) => {
      resendCalls.push({
        method,
        hostname,
        pathName,
        body: opts && opts.body ? JSON.parse(opts.body) : null,
        headers: (opts && opts.headers) || {},
      });
      return { id: 'email_mock_1' };
    });
  });

  afterEach(() => {
    setMollieRequestForTests(null);
    setResendRequestForTests(null);
    if (prevResendKey == null) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevResendKey;
  });

  it('1) paid card mandate creates sub → B with trial wording; entitlement still returned if Resend throws', async () => {
    process.env.RESEND_API_KEY = 're_test_mock';
    const startDate = tomorrowYmd();
    setMollieRequestForTests(async (method, apiPath, body) => {
      if (method === 'GET' && /\/subscriptions/.test(apiPath)) {
        return { _embedded: { subscriptions: [] } };
      }
      if (method === 'POST' && /\/subscriptions$/.test(apiPath)) {
        return {
          id: 'sub_b_card',
          status: 'pending',
          startDate: body.startDate,
          nextPaymentDate: body.startDate,
          amount: body.amount,
        };
      }
      if (method === 'GET' && apiPath === '/customers/cst_b_card') {
        return { id: 'cst_b_card', email: 'card@example.com' };
      }
      throw new Error('unexpected ' + method + ' ' + apiPath);
    });

    const payment = {
      id: 'tr_b_card',
      status: 'paid',
      customerId: 'cst_b_card',
      amount: { currency: 'EUR', value: '0.00' },
      sequenceType: 'first',
      paidAt: new Date().toISOString(),
      metadata: { billing: 'card-trial', trial: '1d' },
    };
    const payload = await grantIfPaid(payment);
    assert.ok(payload);
    assert.equal(payload.plan, 'bellen');
    assert.equal(payload.trial, true);
    assert.equal(resendCalls.length, 1);
    const sent = resendCalls[0].body;
    assert.equal(sent.to[0], 'card@example.com');
    assert.equal(sent.from, resendFrom());
    assert.match(sent.subject, /Bellen is actief/i);
    assert.match(sent.text, /1 dag proef/i);
    assert.match(sent.text, /€18,50 per maand/);
    assert.doesNotMatch(sent.text, /Geen proefperiode/);

    // Resend throws — entitlement still returned
    setResendRequestForTests(async () => {
      throw new Error('resend down');
    });
    setMollieRequestForTests(async (method, apiPath, body) => {
      if (method === 'GET' && /\/subscriptions/.test(apiPath)) {
        return { _embedded: { subscriptions: [] } };
      }
      if (method === 'POST' && /\/subscriptions$/.test(apiPath)) {
        return {
          id: 'sub_b_card2',
          status: 'pending',
          startDate: body.startDate || startDate,
          nextPaymentDate: body.startDate || startDate,
          amount: body.amount,
        };
      }
      if (method === 'GET' && apiPath === '/customers/cst_b_card2') {
        return { id: 'cst_b_card2', email: 'card2@example.com' };
      }
      throw new Error('unexpected ' + method + ' ' + apiPath);
    });
    const payload2 = await grantIfPaid({
      ...payment,
      id: 'tr_b_card2',
      customerId: 'cst_b_card2',
    });
    assert.ok(payload2);
    assert.equal(payload2.plan, 'bellen');
    assert.equal(payload2.subscriptionId, 'sub_b_card2');
  });

  it('2) paid iDEAL (billing ideal-sepa) → B paid-now / no trial wording', async () => {
    process.env.RESEND_API_KEY = 're_test_mock';
    setMollieRequestForTests(async (method, apiPath, body) => {
      if (method === 'GET' && /\/subscriptions/.test(apiPath)) {
        return { _embedded: { subscriptions: [] } };
      }
      if (method === 'POST' && /\/subscriptions$/.test(apiPath)) {
        return {
          id: 'sub_b_ideal',
          status: 'pending',
          startDate: body.startDate,
          nextPaymentDate: body.startDate,
          amount: body.amount,
        };
      }
      if (method === 'GET' && apiPath === '/customers/cst_b_ideal') {
        return { id: 'cst_b_ideal', email: 'ideal@example.com' };
      }
      throw new Error('unexpected ' + method + ' ' + apiPath);
    });
    const payload = await grantIfPaid({
      id: 'tr_b_ideal',
      status: 'paid',
      method: 'ideal',
      customerId: 'cst_b_ideal',
      amount: { currency: 'EUR', value: '18.50' },
      sequenceType: 'first',
      paidAt: '2026-09-30T12:00:00.000Z',
      metadata: { billing: 'ideal-sepa', trial: '0' },
    });
    assert.ok(payload);
    assert.equal(payload.plan, 'bellen');
    assert.equal(payload.trial, false);
    assert.equal(resendCalls.length, 1);
    const text = resendCalls[0].body.text;
    assert.match(text, /€18,50 betaald/i);
    assert.match(text, /Geen proefperiode/);
    assert.doesNotMatch(text, /1 dag proef/);
  });

  it('3) no RESEND_API_KEY → no HTTP to Resend; grantIfPaid still returns entitlement', async () => {
    delete process.env.RESEND_API_KEY;
    setMollieRequestForTests(async (method, apiPath, body) => {
      if (method === 'GET' && /\/subscriptions/.test(apiPath)) {
        return { _embedded: { subscriptions: [] } };
      }
      if (method === 'POST' && /\/subscriptions$/.test(apiPath)) {
        return {
          id: 'sub_nokey',
          status: 'pending',
          startDate: body.startDate,
          nextPaymentDate: body.startDate,
          amount: body.amount,
        };
      }
      if (method === 'GET' && apiPath === '/customers/cst_nokey') {
        return { id: 'cst_nokey', email: 'nokey@example.com' };
      }
      throw new Error('unexpected ' + method + ' ' + apiPath);
    });
    const payload = await grantIfPaid({
      id: 'tr_nokey',
      status: 'paid',
      customerId: 'cst_nokey',
      amount: { currency: 'EUR', value: '0.00' },
      sequenceType: 'first',
      paidAt: new Date().toISOString(),
      metadata: { billing: 'card-trial' },
    });
    assert.ok(payload);
    assert.equal(payload.plan, 'bellen');
    assert.equal(resendCalls.length, 0);
  });

  it('4) failed charge webhook → C email; does not grant Bellen', async () => {
    process.env.RESEND_API_KEY = 're_test_mock';
    let grantCalled = false;
    setMollieRequestForTests(async (method, apiPath) => {
      if (method === 'GET' && apiPath === '/payments/tr_fail1') {
        return {
          id: 'tr_fail1',
          status: 'failed',
          customerId: 'cst_fail',
          amount: { currency: 'EUR', value: '18.50' },
          sequenceType: 'recurring',
        };
      }
      if (method === 'GET' && apiPath === '/customers/cst_fail') {
        return { id: 'cst_fail', email: 'fail@example.com' };
      }
      if (method === 'POST' && /\/subscriptions/.test(apiPath)) {
        grantCalled = true;
        throw new Error('should not create subscription on failed charge');
      }
      throw new Error('unexpected ' + method + ' ' + apiPath);
    });
    const res = mockRes();
    await webhook(
      { method: 'POST', url: '/api/mollie/webhook', headers: {}, body: { id: 'tr_fail1' } },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, 'OK');
    assert.equal(grantCalled, false);
    assert.equal(resendCalls.length, 1);
    assert.match(resendCalls[0].body.subject, /mislukt/i);
    assert.match(resendCalls[0].body.text, /mislukt/i);
    assert.match(resendCalls[0].body.text, /prijzen/);
    assert.equal(resendCalls[0].body.to[0], 'fail@example.com');
  });

  it('4b) open/pending webhook does not send C; €0 paid mandate failed-oddity skipped for C', async () => {
    process.env.RESEND_API_KEY = 're_test_mock';
    setMollieRequestForTests(async (method, apiPath) => {
      if (method === 'GET' && apiPath === '/payments/tr_open') {
        return {
          id: 'tr_open',
          status: 'open',
          customerId: 'cst_x',
          amount: { currency: 'EUR', value: '18.50' },
        };
      }
      if (method === 'GET' && apiPath === '/payments/tr_zero_fail') {
        return {
          id: 'tr_zero_fail',
          status: 'failed',
          customerId: 'cst_x',
          amount: { currency: 'EUR', value: '0.00' },
        };
      }
      throw new Error('unexpected ' + method + ' ' + apiPath);
    });
    const res1 = mockRes();
    await webhook(
      { method: 'POST', url: '/api/mollie/webhook', headers: {}, body: { id: 'tr_open' } },
      res1
    );
    assert.equal(res1.statusCode, 200);
    assert.equal(resendCalls.length, 0);

    const res2 = mockRes();
    await webhook(
      { method: 'POST', url: '/api/mollie/webhook', headers: {}, body: { id: 'tr_zero_fail' } },
      res2
    );
    assert.equal(res2.statusCode, 200);
    assert.equal(resendCalls.length, 0);
  });

  it('5) cancelled subscription webhook → D email; entitlement fail-closes (no grant)', async () => {
    process.env.RESEND_API_KEY = 're_test_mock';
    setMollieRequestForTests(async (method, apiPath) => {
      if (
        method === 'GET' &&
        apiPath === '/customers/cst_cancel/subscriptions/sub_cancel'
      ) {
        return {
          id: 'sub_cancel',
          status: 'canceled',
          customerId: 'cst_cancel',
        };
      }
      if (method === 'GET' && apiPath === '/customers/cst_cancel') {
        return { id: 'cst_cancel', email: 'cancel@example.com' };
      }
      if (method === 'POST' && /\/subscriptions/.test(apiPath)) {
        throw new Error('must not create sub on cancel webhook');
      }
      throw new Error('unexpected ' + method + ' ' + apiPath);
    });
    const res = mockRes();
    await webhook(
      {
        method: 'POST',
        url: '/api/mollie/webhook?customer_id=cst_cancel',
        headers: {},
        body: { id: 'sub_cancel' },
      },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, 'OK');
    assert.equal(resendCalls.length, 1);
    assert.match(resendCalls[0].body.subject, /opgezegd/i);
    assert.match(resendCalls[0].body.text, /opgezegd/i);
    assert.equal(resendCalls[0].body.to[0], 'cancel@example.com');
  });
});
