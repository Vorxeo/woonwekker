'use strict';
const {
  googleConfigured,
  createOAuthState,
  buildAuthUrl,
  stateCookie,
  isSecureReq,
  setCookies,
  redirect,
  sendJson,
} = require('../../lib/ww-auth.cjs');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!googleConfigured()) {
    return sendJson(res, 503, {
      error: 'google_unavailable',
      message:
        'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (server-only).',
      googleConfigured: false,
    });
  }
  try {
    const { state, challenge, cookieValue } = createOAuthState();
    const url = buildAuthUrl(req, { state, challenge });
    const secure = isSecureReq(req);
    setCookies(res, [stateCookie(cookieValue, { secure })]);
    return redirect(res, url);
  } catch (e) {
    console.error('[auth/google]', e.message);
    return sendJson(res, 503, {
      error: 'google_unavailable',
      message: e.message || 'Google OAuth failed',
      googleConfigured: false,
    });
  }
};
