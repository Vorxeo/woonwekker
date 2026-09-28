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
/** Soft upper bound for cookie Max-Age (~1 month + small grace). Real exp tracks Mollie anniversary. */
const COOKIE_MAX_AGE = 35 * 24 * 60 * 60;
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

/** @type {typeof defaultMollieRequest | null} */
let _mollieRequestOverride = null;

function defaultMollieRequest(method, apiPath, body) {
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

function mollieRequest(method, apiPath, body) {
  if (_mollieRequestOverride) return _mollieRequestOverride(method, apiPath, body);
  return defaultMollieRequest(method, apiPath, body);
}

/** Test-only: inject mocked Mollie HTTP. Pass null to restore. */
function setMollieRequestForTests(fn) {
  _mollieRequestOverride = typeof fn === 'function' ? fn : null;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}
function signEntitlement(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', entitlementSecret()).update(body).digest('base64url');
  return body + '.' + sig;
}
function verifyEntitlementToken(token, { allowExpired = false } = {}) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expect = crypto.createHmac('sha256', entitlementSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || payload.plan !== 'bellen') return null;
    if (!allowExpired && payload.exp && Date.now() > payload.exp) return null;
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

/**
 * Same calendar day next month (UTC date parts). Month-end: Jan 31 → Feb 28/29, etc.
 * Aligns with Mollie `interval: '1 month'` anniversary billing.
 */
function addOneCalendarMonth(input) {
  const d = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  if (Number.isNaN(d.getTime())) return addOneCalendarMonth(new Date());
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const lastOfTarget = new Date(Date.UTC(y, m + 2, 0)).getUTCDate();
  const out = new Date(Date.UTC(y, m + 1, Math.min(day, lastOfTarget)));
  out.setUTCHours(d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
  return out;
}

/** Mollie YYYY-MM-DD → end of that UTC day (ms), or null. */
function parseMollieDateEndMs(yyyyMmDd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(yyyyMmDd || '').trim());
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999);
}

/** Tomorrow as Mollie YYYY-MM-DD (UTC calendar day). */
function tomorrowYmd(fromDate) {
  const d = fromDate instanceof Date ? new Date(fromDate.getTime()) : fromDate ? new Date(fromDate) : new Date();
  if (Number.isNaN(d.getTime())) return tomorrowYmd(new Date());
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
  const y = t.getUTCFullYear();
  const m = String(t.getUTCMonth() + 1).padStart(2, '0');
  const day = String(t.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** End of startDate UTC day — trial window until first Bellen charge. */
function trialEndMs(startDateYmd) {
  const end = parseMollieDateEndMs(startDateYmd || tomorrowYmd());
  return end != null ? end : Date.now() + 24 * 60 * 60 * 1000;
}

/**
 * Entitlement exp: prefer Mollie subscription nextPaymentDate / startDate (trial end),
 * else ~1 calendar month from grant/paid date (anniversary day).
 * During 1-day trial, pending sub nextPaymentDate/startDate ≈ tomorrow → ~24h window.
 */
function computeEntitlementExp({ subscription, fromDate, trialStartDate } = {}) {
  const sub = subscription || null;
  if (sub) {
    let npd = parseMollieDateEndMs(sub.nextPaymentDate);
    if (npd == null) npd = parseMollieDateEndMs(sub.startDate);
    if (npd != null) {
      if (npd <= Date.now()) {
        // Renewal day in flight / clock skew: extend one anniversary month from that date.
        npd = addOneCalendarMonth(new Date(npd)).getTime();
      }
      if (npd > Date.now()) return npd;
    }
    const periodEnd = sub.currentPeriodEnd || sub.periodEnd || null;
    if (periodEnd) {
      const t = typeof periodEnd === 'number' ? periodEnd : Date.parse(periodEnd);
      if (!Number.isNaN(t) && t > Date.now()) return t;
    }
  }
  if (trialStartDate) {
    const te = trialEndMs(trialStartDate);
    if (te > Date.now()) return te;
  }
  let base = fromDate instanceof Date ? fromDate : fromDate ? new Date(fromDate) : new Date();
  if (Number.isNaN(base.getTime())) base = new Date();
  return addOneCalendarMonth(base).getTime();
}

function cookieMaxAgeSeconds(expMs) {
  if (expMs == null || !Number.isFinite(expMs)) return COOKIE_MAX_AGE;
  const secs = Math.ceil((expMs - Date.now()) / 1000);
  if (secs < 60) return 60;
  return Math.min(secs, COOKIE_MAX_AGE);
}

function cookieHeader(token, { clear = false, secure = true, exp } = {}) {
  if (clear) return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  const parts = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${cookieMaxAgeSeconds(exp)}`,
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

function entitlementPayloadFromPayment(payment, extra = {}) {
  const subscription = extra.subscription || null;
  const fromDate = (payment && payment.paidAt) || extra.fromDate || Date.now();
  const trialStartDate =
    extra.trialStartDate ||
    (subscription && subscription.startDate) ||
    null;
  const exp = computeEntitlementExp({ subscription, fromDate, trialStartDate });
  // Trial while exp is within ~2 days (startDate EOD) — not a full month anniversary.
  const msLeft = exp - Date.now();
  const looksLikeTrial = msLeft > 0 && msLeft <= 2 * 24 * 60 * 60 * 1000 + 1000;
  return {
    plan: 'bellen',
    source: 'mollie',
    customerId: (payment && payment.customerId) || extra.customerId || undefined,
    subscriptionId: (subscription && subscription.id) || extra.subscriptionId || undefined,
    paymentId: (payment && payment.id) || extra.paymentId || undefined,
    trial: extra.trial === true || (extra.trial !== false && looksLikeTrial),
    exp,
  };
}

/** Active/pending Mollie subscription for customer, or null. Fail-closed without API key. */
async function findActiveBellenSubscription(customerId) {
  if (!customerId || !mollieEnabled()) return null;
  const subs = await mollieRequest(
    'GET',
    `/customers/${encodeURIComponent(customerId)}/subscriptions?limit=10`
  );
  const list = (subs._embedded && subs._embedded.subscriptions) || [];
  return list.find((s) => s.status === 'active' || s.status === 'pending') || null;
}

/**
 * Resolve Bellen plan; when Mollie is configured and cookie has customerId,
 * re-verify subscription and re-issue cookie with monthly-anniversary exp
 * (Mollie nextPaymentDate / period end, else +1 calendar month).
 * Expired cookie + still-active sub → unlock again. No key → no refresh (fail-closed).
 * Login/auth cookies are unrelated — this only touches ww_bellen.
 */
async function resolveEntitlement(req, { refresh = true } = {}) {
  const cookies = parseCookies(req);
  const raw = cookies[COOKIE];
  const valid = verifyEntitlementToken(raw);
  const signed = verifyEntitlementToken(raw, { allowExpired: true });
  const host = String((req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '');
  const secure = !/localhost|127\.0\.0\.1/i.test(host);
  const empty = { plan: 'kijken', source: null, payload: null, setCookie: null, refreshed: false };

  if (!refresh) {
    if (!valid) return empty;
    return { plan: 'bellen', source: valid.source || 'mollie', payload: valid, setCookie: null, refreshed: false };
  }

  const customerId = (valid && valid.customerId) || (signed && signed.customerId) || null;

  // No durable customer id: honour non-expired cookie only; cannot re-verify.
  if (!customerId) {
    if (valid) {
      return { plan: 'bellen', source: valid.source || 'mollie', payload: valid, setCookie: null, refreshed: false };
    }
    return empty;
  }

  if (!mollieEnabled()) {
    // Fail-closed for refresh/re-issue; still-valid cookie keeps access until natural exp.
    if (valid) {
      return { plan: 'bellen', source: valid.source || 'mollie', payload: valid, setCookie: null, refreshed: false };
    }
    return empty;
  }

  try {
    const active = await findActiveBellenSubscription(customerId);
    if (active) {
      const trialStartDate = active.startDate || null;
      const exp = computeEntitlementExp({
        subscription: active,
        fromDate: new Date(),
        trialStartDate,
      });
      const msLeft = exp - Date.now();
      const payload = {
        plan: 'bellen',
        source: 'mollie',
        customerId,
        subscriptionId: active.id,
        paymentId: (valid && valid.paymentId) || (signed && signed.paymentId) || undefined,
        trial: msLeft > 0 && msLeft <= 2 * 24 * 60 * 60 * 1000 + 1000,
        exp,
      };
      return {
        plan: 'bellen',
        source: 'mollie',
        payload,
        setCookie: cookieHeader(signEntitlement(payload), { secure, exp: payload.exp }),
        refreshed: true,
      };
    }
    // No active/pending sub (cancelled / missing): fail-closed — clear ww_bellen.
    return {
      plan: 'kijken',
      source: null,
      payload: null,
      setCookie: cookieHeader('', { clear: true, secure }),
      refreshed: false,
    };
  } catch (e) {
    console.warn('[entitlement] mollie re-verify failed:', e.message);
    // Transient Mollie errors: keep valid cookie; expired stays locked (fail-closed).
    if (valid) {
      return { plan: 'bellen', source: valid.source || 'mollie', payload: valid, setCookie: null, refreshed: false };
    }
    return empty;
  }
}

async function grantIfPaid(payment) {
  if (!payment || payment.status !== 'paid') return null;
  let subscription = null;
  const startDate = tomorrowYmd(payment.paidAt || Date.now());
  // After mandate (sequenceType first, often €0.00), create subscription starting tomorrow (1-day trial).
  if (payment.customerId && mollieEnabled()) {
    try {
      subscription = await findActiveBellenSubscription(payment.customerId);
      if (!subscription) {
        const sub = await mollieRequest('POST', `/customers/${payment.customerId}/subscriptions`, {
          amount: { currency: 'EUR', value: '18.50' },
          interval: '1 month',
          startDate,
          description: 'Bellen',
        });
        if (sub && sub.id) subscription = sub;
      }
    } catch (e) {
      console.warn('[mollie] subscription create deferred:', e.message);
      try {
        subscription = await findActiveBellenSubscription(payment.customerId);
      } catch (_) {}
    }
  }
  return entitlementPayloadFromPayment(payment, {
    subscription,
    trialStartDate: (subscription && (subscription.startDate || subscription.nextPaymentDate)) || startDate,
    trial: true,
  });
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
  setMollieRequestForTests,
  publicBase,
  signEntitlement,
  verifyEntitlementToken,
  parseCookies,
  cookieHeader,
  cookieMaxAgeSeconds,
  addOneCalendarMonth,
  parseMollieDateEndMs,
  tomorrowYmd,
  trialEndMs,
  computeEntitlementExp,
  getEntitlement,
  entitlementPayloadFromPayment,
  findActiveBellenSubscription,
  resolveEntitlement,
  grantIfPaid,
  loadFullListings,
  redactListing,
  readJsonBody,
  sendJson,
  crypto,
};
