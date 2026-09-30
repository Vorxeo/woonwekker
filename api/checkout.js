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
        'Mollie not configured. Set MOLLIE_API_KEY or Mollie_Api_Key in Vercel Production env (server-only). Unlock remains closed.',
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
  const ideal = String(body.method || '').toLowerCase() === 'ideal';
  const base = publicBase(req);
  try {
    if (ideal) {
      const methods = await mollieRequest(
        'GET',
        '/methods?sequenceType=recurring&amount[value]=18.50&amount[currency]=EUR'
      );
      const list = (methods && methods._embedded && methods._embedded.methods) || [];
      const sepa = list.some((m) => m && m.id === 'directdebit');
      if (!sepa) {
        return sendJson(res, 503, {
          error: 'sepa_unavailable',
          message: 'SEPA Direct Debit is not active. iDEAL recurring stays closed.',
        });
      }
    }
    const customer = await mollieRequest('POST', '/customers', {
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
      metadata: { product: 'woonwekker-bellen' },
    });
    const stateToken = crypto.randomBytes(16).toString('hex');
    // Card/wallet: €0.00 first payment creates a card mandate; subscription starts tomorrow (1-day trial).
    // iDEAL: Mollie will not mandate at €0. First payment is €18.50 (first month) and creates a SEPA mandate.
    // Subscription starts in one month so that first iDEAL charge is not billed again the next day.
    const pay = await mollieRequest('POST', '/payments', {
      amount: { currency: 'EUR', value: ideal ? '18.50' : '0.00' },
      description: ideal
        ? 'Woonwekker Bellen — €18,50 nu, daarna €18,50/maand'
        : 'Woonwekker Bellen — 1 dag gratis, daarna €18,50/maand',
      redirectUrl: `${base}/api/checkout/return?customer_id=${encodeURIComponent(customer.id)}&state=${encodeURIComponent(stateToken)}`,
      webhookUrl: `${base}/api/mollie/webhook`,
      sequenceType: 'first',
      customerId: customer.id,
      ...(ideal ? { method: 'ideal' } : {}),
      metadata: {
        product: 'woonwekker-bellen',
        plan: 'bellen',
        trial: ideal ? '0' : '1d',
        billing: ideal ? 'ideal-sepa' : 'card-trial',
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
