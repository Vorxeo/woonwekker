'use strict';
/**
 * Start a Bellen subscription.
 * Order of checks (each fails closed):
 *   1. POST only.
 *   2. Both consents ticked by the visitor: consentTerms (algemene voorwaarden) and
 *      consentImmediateStart (start now, within the 14-day withdrawal period). Else 400.
 *   3. New subscriptions open only when an operator switched a provider on (checkoutAvailable).
 *      Else 503 with neutral copy that names no payment provider.
 * The legacy provider client below stays dormant until then.
 */
const {
  checkoutAvailable,
  mollieRequest,
  publicBase,
  readJsonBody,
  sendJson,
  crypto,
} = require('../lib/ww-gate.cjs');

const TERMS_VERSION = '1.0';
const UNAVAILABLE = {
  error: 'subscriptions_unavailable',
  message: 'New subscriptions are temporarily unavailable. Searching and the links to the original ads stay free.',
};

function ticked(v) {
  return v === true || v === 'true' || v === 'on' || v === '1';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    body = {};
  }
  const consentTerms = ticked(body.consentTerms);
  const consentImmediateStart = ticked(body.consentImmediateStart);
  if (!consentTerms || !consentImmediateStart) {
    return sendJson(res, 400, {
      error: 'consent_required',
      missing: [!consentTerms && 'consentTerms', !consentImmediateStart && 'consentImmediateStart'].filter(Boolean),
    });
  }
  if (!checkoutAvailable()) return sendJson(res, 503, UNAVAILABLE);

  const email = String(body.email || '').trim().slice(0, 120);
  const name = String(body.name || '').trim().slice(0, 80);
  const consentAt = new Date().toISOString();
  const base = publicBase(req);
  try {
    const customer = await mollieRequest('POST', '/customers', {
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
      metadata: { product: 'woonwekker-bellen' },
    });
    const stateToken = crypto.randomBytes(16).toString('hex');
    // €0.00 first payment creates a mandate; the subscription starts the next day (1 day free).
    const pay = await mollieRequest('POST', '/payments', {
      amount: { currency: 'EUR', value: '0.00' },
      description: 'Woonwekker Bellen — 1 dag gratis, daarna €18,50 per maand',
      redirectUrl: `${base}/api/checkout/return?customer_id=${encodeURIComponent(customer.id)}&state=${encodeURIComponent(stateToken)}`,
      webhookUrl: `${base}/api/mollie/webhook`,
      sequenceType: 'first',
      customerId: customer.id,
      metadata: {
        product: 'woonwekker-bellen',
        plan: 'bellen',
        trial: '1d',
        billing: 'card-trial',
        state: stateToken,
        consentTerms: true,
        consentImmediateStart: true,
        consentAt,
        termsVersion: TERMS_VERSION,
      },
    });
    const checkoutUrl = pay._links && pay._links.checkout && pay._links.checkout.href;
    if (!checkoutUrl) return sendJson(res, 502, { error: 'checkout_failed' });
    console.log('[checkout] consent', JSON.stringify({ paymentId: pay.id, consentAt, termsVersion: TERMS_VERSION }));
    return sendJson(res, 200, { url: checkoutUrl });
  } catch (e) {
    console.error('[checkout]', e.message, e.body || '');
    return sendJson(res, e.code === 'MOLLIE_UNAVAILABLE' ? 503 : 502, e.code === 'MOLLIE_UNAVAILABLE' ? UNAVAILABLE : { error: 'checkout_failed' });
  }
};
