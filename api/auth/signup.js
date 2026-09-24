'use strict';
const { readJsonBody } = require('../../lib/ww-gate.cjs');
const {
  resendConfigured,
  makeConfirmToken,
  sendConfirmEmail,
  rateLimitSignup,
  sendJson,
} = require('../../lib/ww-auth.cjs');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!resendConfigured()) {
    return sendJson(res, 503, {
      error: 'resend_unavailable',
      message:
        'Email signup unavailable. Set RESEND_API_KEY (server-only) and verify domain in Resend. No email was sent.',
      resendConfigured: false,
    });
  }
  const ip =
    (req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) ||
    (req.socket && req.socket.remoteAddress) ||
    '';
  if (!rateLimitSignup(String(ip).split(',')[0].trim())) {
    return sendJson(res, 429, { error: 'rate_limited', message: 'Too many signup attempts. Try later.' });
  }
  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    body = {};
  }
  const name = String(body.name || '').trim().slice(0, 80);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
  // password ignored server-side — no DB; optional client-local only
  if (!name || !email || !email.includes('@')) {
    return sendJson(res, 400, { error: 'invalid_signup', message: 'Name and email are required.' });
  }
  try {
    const token = makeConfirmToken({ email, name });
    await sendConfirmEmail(req, { email, name, token });
    return sendJson(res, 200, {
      ok: true,
      pending: true,
      message: 'Confirmation email sent. Check your inbox.',
    });
  } catch (e) {
    console.error('[auth/signup]', e.message);
    if (e.code === 'RESEND_UNAVAILABLE') {
      return sendJson(res, 503, {
        error: 'resend_unavailable',
        message: 'Email signup unavailable. No email was sent.',
        resendConfigured: false,
      });
    }
    return sendJson(res, 502, {
      error: 'email_send_failed',
      message: 'Could not send confirmation email. No account created.',
    });
  }
};
