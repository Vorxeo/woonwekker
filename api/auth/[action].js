'use strict';
/**
 * Hobby plan allows ≤12 serverless functions. Bundle status/me/logout/signup/confirm
 * into one dynamic route. google.js + google/callback.js stay separate (OAuth).
 */
const { readJsonBody } = require('../../lib/ww-gate.cjs');
const {
  googleConfigured,
  resendConfigured,
  getSession,
  publicUser,
  sendJson,
  sessionCookie,
  stateCookie,
  isSecureReq,
  setCookies,
  redirect,
  makeConfirmToken,
  sendConfirmEmail,
  rateLimitSignup,
  verifyConfirmToken,
  makeEmailSessionToken,
} = require('../../lib/ww-auth.cjs');

async function handleStatus(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  const session = getSession(req);
  const user = publicUser(session);
  return sendJson(res, 200, {
    googleConfigured: googleConfigured(),
    resendConfigured: resendConfigured(),
    loggedIn: !!user,
    ...(user ? { user } : {}),
  });
}

async function handleMe(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  const session = getSession(req);
  const user = publicUser(session);
  if (!user) return sendJson(res, 401, { error: 'unauthorized', loggedIn: false });
  return sendJson(res, 200, { loggedIn: true, user });
}

async function handleLogout(req, res) {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'POST') {
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }
  const secure = isSecureReq(req);
  setCookies(res, [
    sessionCookie('', { clear: true, secure }),
    stateCookie('', { clear: true, secure }),
  ]);
  const accept = String((req.headers && req.headers.accept) || '');
  const wantsHtml = /text\/html/i.test(accept) && method === 'GET';
  if (wantsHtml) {
    return redirect(res, '/account/');
  }
  return sendJson(res, 200, { ok: true, loggedIn: false });
}

async function handleSignup(req, res) {
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
}

async function handleConfirm(req, res) {
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
}

const ACTIONS = {
  status: handleStatus,
  me: handleMe,
  logout: handleLogout,
  signup: handleSignup,
  confirm: handleConfirm,
};

module.exports = async function handler(req, res) {
  const action = String((req.query && req.query.action) || '').trim();
  const fn = ACTIONS[action];
  if (!fn) return sendJson(res, 404, { error: 'not_found' });
  return fn(req, res);
};
