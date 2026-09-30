'use strict';
const {
  mollieEnabled,
  mollieRequest,
  grantIfPaid,
  resolveCustomerEmail,
  readJsonBody,
  sendJson,
} = require('../../lib/ww-gate.cjs');
const {
  trySendBellenChargeFailed,
  trySendBellenCanceled,
  resendConfigured,
} = require('../../lib/ww-bellen-mail.cjs');

function queryFromReq(req) {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const q = req.query && typeof req.query === 'object' ? { ...req.query } : {};
    for (const [k, v] of url.searchParams) {
      if (q[k] == null) q[k] = v;
    }
    return q;
  } catch {
    return (req.query && typeof req.query === 'object' && req.query) || {};
  }
}

function ok(res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  return res.end('OK');
}

async function handleCanceledSubscription(sub, customerId) {
  const status = String((sub && sub.status) || '').toLowerCase();
  if (status !== 'canceled' && status !== 'cancelled') return;
  if (!resendConfigured()) return;
  const email = await resolveCustomerEmail(customerId || (sub && sub.customerId), null);
  if (email) await trySendBellenCanceled({ email });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!mollieEnabled()) return sendJson(res, 503, { error: 'payments_unavailable' });
  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    body = {};
  }
  const id = body.id;
  if (!id) return sendJson(res, 400, { error: 'missing_id' });
  const q = queryFromReq(req);
  const customerIdHint = q.customer_id || q.customerId || null;

  try {
    // Subscription webhook (id=sub_… + customer_id on webhookUrl from grantIfPaid)
    if (String(id).startsWith('sub_')) {
      if (!customerIdHint) {
        console.warn('[webhook] subscription id without customer_id; skip');
        return ok(res);
      }
      const sub = await mollieRequest(
        'GET',
        `/customers/${encodeURIComponent(customerIdHint)}/subscriptions/${encodeURIComponent(id)}`
      );
      await handleCanceledSubscription(sub, customerIdHint);
      return ok(res);
    }

    const payment = await mollieRequest('GET', `/payments/${encodeURIComponent(id)}`);
    if (payment.status === 'paid') {
      // grantIfPaid unlocks + may send email B when a subscription is created
      await grantIfPaid(payment);
      return ok(res);
    }

    // C: failed charge only — never open/pending/authorized, never paid €0 mandate.
    if (payment.status === 'failed') {
      const amountVal = payment.amount && payment.amount.value;
      // Defensive: ignore zero-amount (mandate) oddities if Mollie ever marks them failed.
      if (amountVal === '0.00') return ok(res);
      if (resendConfigured()) {
        const email = await resolveCustomerEmail(payment.customerId, payment);
        if (email) await trySendBellenChargeFailed({ email });
      }
      // Do not grant Bellen.
      return ok(res);
    }

    // open / pending / canceled payment / expired — no email, no grant
    return ok(res);
  } catch (e) {
    console.error('[webhook]', e.message);
    return sendJson(res, 500, { error: 'webhook_failed' });
  }
};
