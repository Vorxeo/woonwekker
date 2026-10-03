'use strict';
const { readJsonBody, sendJson } = require('../lib/ww-gate.cjs');
const {
  validateListing,
  sendListingIntake,
  rateLimitIntake,
  resendConfigured,
} = require('../lib/ww-plaats.cjs');

function clientIp(req) {
  const xf = req.headers && (req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For']);
  if (xf) return String(xf).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!resendConfigured()) {
    return sendJson(res, 503, { error: 'intake_unavailable' });
  }
  if (!rateLimitIntake(clientIp(req))) {
    return sendJson(res, 429, { error: 'rate_limited' });
  }
  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: 'invalid_json' });
  }
  const checked = validateListing(body);
  if (!checked.ok) {
    return sendJson(res, 400, { error: 'invalid_listing', fields: checked.errors });
  }
  try {
    await sendListingIntake(checked.listing);
  } catch (e) {
    const code = e && e.code === 'RESEND_UNAVAILABLE' ? 503 : 502;
    return sendJson(res, code, { error: code === 503 ? 'intake_unavailable' : 'intake_failed' });
  }
  return sendJson(res, 200, { ok: true, published: false });
};
