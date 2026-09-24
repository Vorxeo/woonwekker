'use strict';
const {
  googleConfigured,
  readOAuthState,
  exchangeCode,
  fetchUserInfo,
  makeSessionToken,
  sessionCookie,
  stateCookie,
  isSecureReq,
  setCookies,
  redirect,
} = require('../../../lib/ww-auth.cjs');

module.exports = async function handler(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const q = req.query || Object.fromEntries(url.searchParams);
  const code = q.code;
  const state = q.state;
  const err = q.error;
  const secure = isSecureReq(req);
  const clearState = stateCookie('', { clear: true, secure });

  const fail = (reason) => {
    setCookies(res, [clearState]);
    return redirect(res, '/account/?oauth=err' + (reason ? '&reason=' + encodeURIComponent(reason) : ''));
  };

  if (err) return fail('denied');
  if (!googleConfigured()) return fail('unconfigured');
  if (!code || !state) return fail('missing');

  const stored = readOAuthState(req);
  if (!stored || stored.state !== String(state)) return fail('state');

  try {
    const token = await exchangeCode(req, code, stored.verifier);
    if (!token || !token.access_token) return fail('token');
    const info = await fetchUserInfo(token.access_token);
    const sessionToken = makeSessionToken(info);
    setCookies(res, [
      sessionCookie(sessionToken, { secure }),
      clearState,
    ]);
    return redirect(res, '/account/?oauth=ok');
  } catch (e) {
    console.error('[auth/google/callback]', e.message);
    return fail('exchange');
  }
};
