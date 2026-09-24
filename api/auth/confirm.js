'use strict';
const {
  verifyConfirmToken,
  makeEmailSessionToken,
  sessionCookie,
  isSecureReq,
  setCookies,
  redirect,
} = require('../../lib/ww-auth.cjs');

module.exports = async function handler(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const q = req.query || Object.fromEntries(url.searchParams);
  const token = q.token;
  const secure = isSecureReq(req);

  if (!token) {
    return redirect(res, '/account/?confirmed=err');
  }
  const data = verifyConfirmToken(String(token));
  if (!data) {
    return redirect(res, '/account/?confirmed=err');
  }
  try {
    const sessionToken = makeEmailSessionToken(data);
    setCookies(res, [sessionCookie(sessionToken, { secure })]);
    return redirect(res, '/account/?confirmed=1');
  } catch (e) {
    console.error('[auth/confirm]', e.message);
    return redirect(res, '/account/?confirmed=err');
  }
};
