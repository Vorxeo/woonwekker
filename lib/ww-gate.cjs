'use strict';
/**
 * Woonwekker Bellen gate helpers (Mollie + entitlement).
 * Server-only. Reads process.env.MOLLIE_API_KEY — never expose to frontend.
 * Fail-closed when key missing or payment not verified paid.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

const COOKIE = 'ww_bellen';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;
const SOURCE_FIELDS = ['url', 'sourceUrl', 'originalUrl', 'listingUrl', 'externalUrl'];

function mollieKey() {
  return String(process.env.MOLLIE_API_KEY || '').trim();
}
function mollieEnabled() {
  const k = mollieKey();
  return k.startsWith('live_') || k.startsWith('test_');
}
function entitlementSecret() {
  const s = String(process.env.WW_ENTITLEMENT_SECRET || '').trim();
  if (s) return s;
  // Local/dev fallback only — production must set WW_ENTITLEMENT_SECRET on Vercel
  // so cookies verify across serverless isolates. Without it, still fail-closed for unlock
  // via Mollie; signed cookies would be unstable across instances.
  return 'ww-dev-insecure-entitlement-secret-change-me';
}
function publicBase(req) {
  const fromEnv = String(process.env.WW_PUBLIC_BASE || '').replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  const host = (req && (req.headers['x-forwarded-host'] || req.headers.host)) || '127.0.0.1:4174';
  const proto = (req && (req.headers['x-forwarded-proto'] || 'https')) || 'https';
  // On localhost prefer http
  if (/localhost|127\.0\.0\.1/i.test(String(host))) return `http://${host}`;
  return `${proto}://${host}`;
}

function mollieRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    if (!mollieEnabled()) {
      const err = new Error('Mollie not configured');
      err.code = 'MOLLIE_UNAVAILABLE';
      return reject(err);
    }
    const payload = body == null ? null : JSON.stringify(body);
    const req = https.request(
      {
        hostname: 'api.mollie.com',
        path: '/v2' + apiPath,
        method,
        headers: {
          Authorization: 'Bearer ' + mollieKey(),
          Accept: 'application/json',
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
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
            const err = new Error((json && (json.detail || json.title)) || 'Mollie error ' + res.statusCode);
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

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}
function signEntitlement(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', entitlementSecret()).update(body).digest('base64url');
  return body + '.' + sig;
}
function verifyEntitlementToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expect = crypto.createHmac('sha256', entitlementSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || payload.plan !== 'bellen') return null;
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const out = {};
  const raw = (req.headers && req.headers.cookie) || '';
  String(raw)
    .split(';')
    .forEach((part) => {
      const i = part.indexOf('=');
      if (i < 0) return;
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    });
  return out;
}

function cookieHeader(token, { clear = false, secure = true } = {}) {
  if (clear) return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  const parts = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${COOKIE_MAX_AGE}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function getEntitlement(req) {
  const cookies = parseCookies(req);
  const payload = verifyEntitlementToken(cookies[COOKIE]);
  if (!payload) return { plan: 'kijken', source: null, payload: null };
  return { plan: 'bellen', source: payload.source || 'mollie', payload };
}

function entitlementPayloadFromPayment(payment) {
  return {
    plan: 'bellen',
    source: 'mollie',
    customerId: payment.customerId || undefined,
    paymentId: payment.id,
    exp: Date.now() + COOKIE_MAX_AGE * 1000,
  };
}

async function grantIfPaid(payment) {
  if (!payment || payment.status !== 'paid') return null;
  const payload = entitlementPayloadFromPayment(payment);
  // Best-effort subscription after first mandate payment (fail-open for unlock, still paid)
  if (payment.customerId && mollieEnabled()) {
    try {
      await mollieRequest('POST', `/customers/${payment.customerId}/subscriptions`, {
        amount: { currency: 'EUR', value: '15.00' },
        interval: '1 month',
        description: 'Woonwekker Bellen',
      });
    } catch (e) {
      // Mandate may already have a subscription or not be ready — unlock still granted from paid payment.
      console.warn('[mollie] subscription create deferred:', e.message);
    }
  }
  return payload;
}

function resolveFullListingsPath() {
  const candidates = [
    path.join(process.cwd(), 'data', 'listings.full.json'),
    path.join(process.cwd(), 'dist', 'listings.full.json'),
    path.join(__dirname, '..', 'data', 'listings.full.json'),
    path.join(__dirname, '..', 'dist', 'listings.full.json'),
  ];
  for (const fp of candidates) {
    if (fs.existsSync(fp)) return fp;
  }
  return candidates[1];
}

function loadFullListings() {
  const fp = resolveFullListingsPath();
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function redactListing(p) {
  const out = { ...p };
  for (const k of SOURCE_FIELDS) {
    if (k in out) delete out[k];
  }
  return out;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body != null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      return resolve(req.body);
    }
    if (typeof req.body === 'string' && req.body) {
      try {
        return resolve(JSON.parse(req.body));
      } catch {
        try {
          const out = {};
          for (const [k, v] of new URLSearchParams(req.body)) out[k] = v;
          return resolve(out);
        } catch (e) {
          return reject(e);
        }
      }
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        return resolve(JSON.parse(raw));
      } catch {
        const out = {};
        for (const [k, v] of new URLSearchParams(raw)) out[k] = v;
        return resolve(out);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj, headers) {
  const body = JSON.stringify(obj);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (headers) {
    for (const [k, v] of Object.entries(headers)) {
      if (v != null) res.setHeader(k, v);
    }
  }
  res.end(body);
}

module.exports = {
  COOKIE,
  COOKIE_MAX_AGE,
  SOURCE_FIELDS,
  mollieEnabled,
  mollieRequest,
  publicBase,
  signEntitlement,
  verifyEntitlementToken,
  parseCookies,
  cookieHeader,
  getEntitlement,
  grantIfPaid,
  loadFullListings,
  redactListing,
  readJsonBody,
  sendJson,
  crypto,
};
