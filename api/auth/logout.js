'use strict';
const {
  sessionCookie,
  stateCookie,
  isSecureReq,
  setCookies,
  sendJson,
  redirect,
} = require('../../lib/ww-auth.cjs');

module.exports = async function handler(req, res) {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'POST') {
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }
  const secure = isSecureReq(req);
  setCookies(res, [
    sessionCookie('', { clear: true, secure }),
    stateCookie('', { clear: true, secure }),
  ]);
  // Prefer JSON for fetch() clients; allow GET redirect for simple links
  const accept = String((req.headers && req.headers.accept) || '');
  const wantsHtml = /text\/html/i.test(accept) && method === 'GET';
  if (wantsHtml) {
    return redirect(res, '/account/');
  }
  return sendJson(res, 200, { ok: true, loggedIn: false });
};
