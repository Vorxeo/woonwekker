'use strict';
const { mollieEnabled, mollieRequest, grantIfPaid, readJsonBody, sendJson } = require('../../lib/ww-gate.cjs');

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
  try {
    const payment = await mollieRequest('GET', `/payments/${encodeURIComponent(id)}`);
    if (payment.status === 'paid') await grantIfPaid(payment);
    // Mollie expects 200; cookie is set on browser return URL, not webhook.
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    return res.end('OK');
  } catch (e) {
    console.error('[webhook]', e.message);
    return sendJson(res, 500, { error: 'webhook_failed' });
  }
};
