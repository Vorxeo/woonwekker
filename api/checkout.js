'use strict';
const {
  mollieEnabled,
  mollieRequest,
  publicBase,
  readJsonBody,
  sendJson,
  crypto,
} = require('../lib/ww-gate.cjs');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!mollieEnabled()) {
    return sendJson(res, 503, {
      error: 'payments_unavailable',
      message:
        'Mollie not configured. Set MOLLIE_API_KEY in Vercel Production env (server-only). Unlock remains closed.',
    });
  }
  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    body = {};
  }
  const email = String(body.email || '').trim().slice(0, 120);
  const name = String(body.name || '').trim().slice(0, 80);
  const base = publicBase(req);
  try {
    const customer = await mollieRequest('POST', '/customers', {
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
      metadata: { product: 'woonwekker-bellen' },
    });
    const stateToken = crypto.randomBytes(16).toString('hex');
    // €0.00 first payment creates mandate (creditcard / Apple Pay / Google Pay per Mollie).
    // Hosted checkout filters methods; iDEAL needs non-zero first payment — leave method selection to Mollie profile.
    // Subscription (Bellen €18.50/mo) is created on return/webhook with startDate = tomorrow (1-day trial).
    const pay = await mollieRequest('POST', '/payments', {
      amount: { currency: 'EUR', value: '0.00' },
      description: 'Woonwekker Bellen — 1 dag gratis, daarna €18,50/maand',
      redirectUrl: `${base}/api/checkout/return?customer_id=${encodeURIComponent(customer.id)}&state=${encodeURIComponent(stateToken)}`,
      webhookUrl: `${base}/api/mollie/webhook`,
      sequenceType: 'first',
      customerId: customer.id,
      metadata: {
        product: 'woonwekker-bellen',
        plan: 'bellen',
        trial: '1d',
        state: stateToken,
      },
    });
    const checkoutUrl = pay._links && pay._links.checkout && pay._links.checkout.href;
    if (!checkoutUrl) return sendJson(res, 502, { error: 'no_checkout_url' });
    return sendJson(res, 200, { url: checkoutUrl, paymentId: pay.id, customerId: customer.id });
  } catch (e) {
    console.error('[checkout]', e.message, e.body || '');
    return sendJson(res, e.code === 'MOLLIE_UNAVAILABLE' ? 503 : 502, {
      error: 'checkout_failed',
      message: e.message || 'checkout_failed',
    });
  }
};
