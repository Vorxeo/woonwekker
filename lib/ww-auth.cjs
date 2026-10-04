'use strict';
/**
 * Woonwekker Google OAuth + signed session helpers.
 * Server-only. Never expose the Google client secret to the frontend.
 * Open consent (any Google account) — never set hd=.
 * Fail-closed when client id or secret is missing.
 * Accepts GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, or woonwekker_google_oauth_clientid / woonwekker_google_oauth_clientsecret.
 * Resend email confirm for self-serve signup — fail-closed without RESEND_API_KEY or woonwekker_resend_api_key.
 * Google login never sends confirmation email.
 */
const crypto = require('crypto');
const https = require('https');
const { professionalEmail } = require('./ww-mail-layout.cjs');
const { parseCookies, publicBase, sendJson } = require('./ww-gate.cjs');

const SESSION_COOKIE = 'ww_session';
const STATE_COOKIE = 'ww_oauth_state';
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30d
const STATE_MAX_AGE = 10 * 60; // 10 min
const CONFIRM_MAX_AGE = 24 * 60 * 60; // 24h

function firstEnv(names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}
function clientId() {
  return firstEnv(['GOOGLE_CLIENT_ID', 'woonwekker_google_oauth_clientid']);
}
function clientSecret() {
  return firstEnv(['GOOGLE_CLIENT_SECRET', 'woonwekker_google_oauth_clientsecret']);
}
function googleConfigured() {
  return !!(clientId() && clientSecret());
}

function resendKey() {
  const primary = String(process.env.RESEND_API_KEY || '').trim();
  if (primary) return primary;
  return String(process.env.woonwekker_resend_api_key || '').trim();
}
function resendConfigured() {
  return !!resendKey();
}
function resendFrom() {
  const f = String(process.env.RESEND_FROM || '').trim();
  return f || 'Woonwekker <noreply@woonwekker.nl>';
}

function authSecret() {
  const a = String(process.env.WW_AUTH_SECRET || '').trim();
  if (a) return a;
  const s = String(process.env.WW_ENTITLEMENT_SECRET || '').trim();
  if (s) return s;
  return 'ww-dev-insecure-entitlement-secret-change-me';
}

function redirectUri(req) {
  const fromEnv = String(process.env.GOOGLE_REDIRECT_URI || '').trim();
  if (fromEnv) return fromEnv;
  return publicBase(req).replace(/\/$/, '') + '/api/auth/callback/google';
}

function isSecureReq(req) {
  const host = String((req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '');
  return !/localhost|127\.0\.0\.1/i.test(host);
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function signPayload(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', authSecret()).update(body).digest('base64url');
  return body + '.' + sig;
}

function verifySigned(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expect = crypto.createHmac('sha256', authSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || (payload.exp && Date.now() > payload.exp)) return null;
    return payload;
  } catch {
    return null;
  }
}

function cookieParts(name, value, { maxAge, clear = false, secure = true } = {}) {
  if (clear) {
    return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  }
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge != null ? maxAge : SESSION_MAX_AGE}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function sessionCookie(token, { clear = false, secure = true } = {}) {
  return cookieParts(SESSION_COOKIE, token, { maxAge: SESSION_MAX_AGE, clear, secure });
}

function stateCookie(value, { clear = false, secure = true } = {}) {
  return cookieParts(STATE_COOKIE, value, { maxAge: STATE_MAX_AGE, clear, secure });
}

function getSession(req) {
  const cookies = parseCookies(req);
  const payload = verifySigned(cookies[SESSION_COOKIE]);
  if (!payload || !payload.sub || !payload.email) return null;
  return {
    sub: String(payload.sub),
    email: String(payload.email),
    name: String(payload.name || ''),
    picture: String(payload.picture || ''),
    exp: payload.exp,
  };
}

function publicUser(session) {
  if (!session) return null;
  return {
    email: session.email,
    name: session.name,
    picture: session.picture || '',
  };
}

function pkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function createOAuthState() {
  const state = crypto.randomBytes(24).toString('base64url');
  const { verifier, challenge } = pkcePair();
  const payload = {
    state,
    verifier,
    exp: Date.now() + STATE_MAX_AGE * 1000,
  };
  return {
    state,
    challenge,
    cookieValue: signPayload(payload),
  };
}

function readOAuthState(req) {
  const cookies = parseCookies(req);
  const payload = verifySigned(cookies[STATE_COOKIE]);
  if (!payload || !payload.state || !payload.verifier) return null;
  return payload;
}

/**
 * Build Google auth URL. Open to any Google account — do NOT set hd=.
 */
function buildAuthUrl(req, { state, challenge } = {}) {
  if (!googleConfigured()) {
    const err = new Error('Google OAuth not configured');
    err.code = 'GOOGLE_UNAVAILABLE';
    throw err;
  }
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state: state || '',
  });
  if (challenge) {
    params.set('code_challenge', challenge);
    params.set('code_challenge_method', 'S256');
  }
  // Intentionally no hd= — External / any Google account
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}

function httpsJson(method, hostname, pathName, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : typeof body === 'string' ? body : JSON.stringify(body);
    const req = https.request(
      {
        hostname,
        path: pathName,
        method,
        headers: {
          Accept: 'application/json',
          ...(payload
            ? {
                'Content-Type':
                  headers['Content-Type'] ||
                  (typeof body === 'string' ? 'application/x-www-form-urlencoded' : 'application/json'),
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = { raw: text };
          }
          if (res.statusCode >= 400) {
            const err = new Error(
              (json && (json.error_description || json.error || json.message)) ||
                'HTTP ' + res.statusCode
            );
            err.status = res.statusCode;
            err.body = json;
            return reject(err);
          }
          resolve(json);
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function exchangeCode(req, code, codeVerifier) {
  if (!googleConfigured()) {
    const err = new Error('Google OAuth not configured');
    err.code = 'GOOGLE_UNAVAILABLE';
    throw err;
  }
  const form = new URLSearchParams({
    code: String(code),
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: redirectUri(req),
    grant_type: 'authorization_code',
  });
  if (codeVerifier) form.set('code_verifier', codeVerifier);
  return httpsJson('POST', 'oauth2.googleapis.com', '/token', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
}

async function fetchUserInfo(accessToken) {
  return httpsJson('GET', 'openidconnect.googleapis.com', '/v1/userinfo', {
    headers: { Authorization: 'Bearer ' + accessToken },
  });
}

function makeSessionToken(userInfo) {
  const sub = String(userInfo.sub || userInfo.id || '').trim();
  const email = String(userInfo.email || '').trim();
  if (!sub || !email) {
    const err = new Error('incomplete_userinfo');
    err.code = 'INCOMPLETE_USERINFO';
    throw err;
  }
  return signPayload({
    sub,
    email,
    name: String(userInfo.name || '').trim().slice(0, 80),
    picture: String(userInfo.picture || '').trim().slice(0, 500),
    exp: Date.now() + SESSION_MAX_AGE * 1000,
  });
}

function setCookies(res, cookies) {
  // Node/Vercel: multiple Set-Cookie via array
  const list = Array.isArray(cookies) ? cookies.filter(Boolean) : [cookies];
  if (typeof res.setHeader === 'function') {
    res.setHeader('Set-Cookie', list.length === 1 ? list[0] : list);
  }
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
}


function makeConfirmToken({ email, name }) {
  const em = String(email || '').trim().toLowerCase().slice(0, 120);
  const nm = String(name || '').trim().slice(0, 80);
  if (!em || !em.includes('@') || !nm) {
    const err = new Error('invalid_signup');
    err.code = 'INVALID_SIGNUP';
    throw err;
  }
  return signPayload({
    typ: 'email_confirm',
    email: em,
    name: nm,
    exp: Date.now() + CONFIRM_MAX_AGE * 1000,
  });
}

function verifyConfirmToken(token) {
  const payload = verifySigned(token);
  if (!payload || payload.typ !== 'email_confirm') return null;
  if (!payload.email || !payload.name) return null;
  return {
    email: String(payload.email),
    name: String(payload.name),
  };
}

function confirmUrl(req, token) {
  return publicBase(req).replace(/\/$/, '') + '/api/auth/confirm?token=' + encodeURIComponent(token);
}

async function sendConfirmEmail(req, { email, name, token }) {
  if (!resendConfigured()) {
    const err = new Error('Resend not configured');
    err.code = 'RESEND_UNAVAILABLE';
    throw err;
  }
  const link = confirmUrl(req, token);
  const mail = professionalEmail({
    paragraphs: [
      'Hoi ' + name + ',',
      'Bevestig je e-mailadres voor Woonwekker.',
      'Link geldig 24 uur. Geen Bellen-unlock — alleen account.',
    ],
    link,
    linkLabel: 'E-mail bevestigen',
  });
  const html = mail.html;
  const text = mail.text;
  const body = JSON.stringify({
    from: resendFrom(),
    to: [email],
    subject: 'Bevestig je Woonwekker-account',
    html,
    text,
  });
  return httpsJson('POST', 'api.resend.com', '/emails', {
    headers: {
      Authorization: 'Bearer ' + resendKey(),
      'Content-Type': 'application/json',
    },
    body,
  });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function makeEmailSessionToken({ email, name }) {
  return signPayload({
    sub: 'email:' + String(email).toLowerCase(),
    email: String(email).toLowerCase(),
    name: String(name || '').trim().slice(0, 80),
    picture: '',
    provider: 'email',
    exp: Date.now() + SESSION_MAX_AGE * 1000,
  });
}

// Light in-memory rate limit (per isolate; best-effort)
const _signupHits = new Map();
function rateLimitSignup(ip, limit = 8, windowMs = 15 * 60 * 1000) {
  const key = String(ip || 'unknown');
  const now = Date.now();
  let arr = _signupHits.get(key) || [];
  arr = arr.filter((t) => now - t < windowMs);
  if (arr.length >= limit) return false;
  arr.push(now);
  _signupHits.set(key, arr);
  return true;
}

module.exports = {
  SESSION_COOKIE,
  STATE_COOKIE,
  SESSION_MAX_AGE,
  googleConfigured,
  resendConfigured,
  resendFrom,
  clientId,
  redirectUri,
  authSecret,
  isSecureReq,
  parseCookies,
  getSession,
  publicUser,
  createOAuthState,
  readOAuthState,
  buildAuthUrl,
  exchangeCode,
  fetchUserInfo,
  makeSessionToken,
  makeConfirmToken,
  verifyConfirmToken,
  confirmUrl,
  sendConfirmEmail,
  makeEmailSessionToken,
  rateLimitSignup,
  CONFIRM_MAX_AGE,
  sessionCookie,
  stateCookie,
  setCookies,
  redirect,
  sendJson,
  signPayload,
  verifySigned,
};
