'use strict';
/**
 * Withdrawal (herroeping / ontbinding) and cancellation requests.
 * No login: a consumer must be able to withdraw or cancel with name + email alone.
 *
 * Storage: there is no database on this project. Every request is
 *  1) written as one structured JSON line to the function log ("[ww-legal-request]"),
 *  2) appended to a JSONL file (WW_LEGAL_LOG_FILE, default /tmp/ww-legal-requests.jsonl;
 *     ephemeral on serverless, durable on a long-running server),
 *  3) mailed to the consumer and, when WW_LEGAL_INBOX is set, to the operator (Resend).
 * The response only says "emailed: true" when Resend accepted the consumer mail.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KINDS = { withdraw: 'withdrawal', cancel: 'cancellation' };
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const hits = new Map();

function clientIp(req) {
  const xf = String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '');
  const first = xf.split(',')[0].trim();
  return first || (req.socket && req.socket.remoteAddress) || 'unknown';
}

/** In-memory, per instance: a speed bump against floods, not a guarantee. */
function rateLimited(ip, now = Date.now()) {
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > RATE_LIMIT;
}

function resetRateLimit() {
  hits.clear();
}

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

/** Validate name, email, optional orderDate (YYYY-MM-DD, not in the future). */
function validateRequest(body) {
  const b = body && typeof body === 'object' ? body : {};
  const name = String(b.name || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120);
  const email = String(b.email || '').trim().slice(0, 160);
  const orderDateRaw = String(b.orderDate || '').trim();
  const errors = [];
  if (name.length < 2) errors.push('name');
  if (!EMAIL_RE.test(email)) errors.push('email');
  let orderDate = '';
  if (orderDateRaw) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(orderDateRaw);
    const t = m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
    if (!m || Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== orderDateRaw || t > Date.now() + 24 * 3600 * 1000) {
      errors.push('orderDate');
    } else orderDate = orderDateRaw;
  }
  return { ok: errors.length === 0, errors, value: { name, email, orderDate } };
}

function makeReference(now = new Date()) {
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
  return 'WW-' + ymd + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

function logFile() {
  return String(process.env.WW_LEGAL_LOG_FILE || '').trim() || path.join('/tmp', 'ww-legal-requests.jsonl');
}

/** Persist one request record. Returns where it was stored. */
function storeRequest(record) {
  const stored = { log: false, file: false };
  try {
    console.log('[ww-legal-request] ' + JSON.stringify(record));
    stored.log = true;
  } catch {}
  try {
    fs.appendFileSync(logFile(), JSON.stringify(record) + '\n');
    stored.file = true;
  } catch (e) {
    console.error('[ww-legal-request] file store failed:', e && e.message);
  }
  return stored;
}

function buildRecord({ kind, value, req, extra = {} }) {
  const receivedAt = new Date();
  const ip = clientIp(req);
  return {
    type: KINDS[kind] || kind,
    reference: makeReference(receivedAt),
    receivedAt: receivedAt.toISOString(),
    name: value.name,
    email: value.email,
    orderDate: value.orderDate || null,
    // Hashed so the log can link repeat requests without holding the raw IP.
    ipHash: crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 16),
    userAgent: String((req.headers && req.headers['user-agent']) || '').slice(0, 160),
    ...extra,
  };
}

function wantsHtml(req) {
  const accept = String((req.headers && req.headers.accept) || '');
  const type = String((req.headers && req.headers['content-type']) || '');
  return !/application\/json/i.test(accept) && /x-www-form-urlencoded|multipart\/form-data/i.test(type);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Plain confirmation page for browsers that post the form without JavaScript. */
function htmlConfirmation({ status, kind, result }) {
  const ok = status === 200 && result && result.ok === true;
  const nl = ok
    ? (kind === 'withdraw' ? 'We hebben je verzoek tot ontbinding ontvangen' : 'We hebben je opzegging ontvangen') + ' op ' + esc(result.receivedAt) + ' (UTC). Referentie: ' + esc(result.reference) + '. ' + (result.emailed ? 'We hebben een bevestiging gemaild.' : 'We konden geen bevestiging mailen; bewaar deze pagina als bewijs.')
    : status === 429 ? 'Te veel verzoeken. Probeer het over 10 minuten opnieuw.' : 'Controleer je naam en e-mailadres en probeer het opnieuw.';
  const en = ok
    ? 'Request received on ' + esc(result.receivedAt) + ' (UTC). Reference: ' + esc(result.reference) + '. ' + (result.emailed ? 'We emailed a confirmation.' : 'We could not email a confirmation; keep this page as proof.')
    : status === 429 ? 'Too many requests. Try again in 10 minutes.' : 'Check your name and email address and try again.';
  return '<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Woonwekker</title></head><body style="font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem"><h1>Woonwekker</h1><p><strong>' + nl + '</strong></p><p lang="en">' + en + '</p><p><a href="/">woonwekker.nl</a></p></body></html>';
}

module.exports = {
  KINDS,
  RATE_LIMIT,
  RATE_WINDOW_MS,
  clientIp,
  rateLimited,
  resetRateLimit,
  validateRequest,
  makeReference,
  storeRequest,
  buildRecord,
  wantsHtml,
  htmlConfirmation,
  logFile,
};
