'use strict';
/**
 * Bellen customer emails via Resend (Keel B / C / D).
 * Side-effect only: missing key or Resend errors never change unlock/entitlement.
 * Reuses RESEND_API_KEY / RESEND_FROM (same as signup confirm in ww-auth.cjs).
 * Nicole owns NL/EN polish — bodies are short factual Dutch only (signup mailer is NL-only).
 */
const https = require('https');

/** @type {null | ((method: string, hostname: string, pathName: string, opts: object) => Promise<any>)} */
let _resendRequestOverride = null;

function resendKey() {
  return String(process.env.RESEND_API_KEY || '').trim();
}

function resendConfigured() {
  return !!resendKey();
}

function resendFrom() {
  const f = String(process.env.RESEND_FROM || '').trim();
  return f || 'Woonwekker <noreply@woonwekker.nl>';
}

function siteBase() {
  const fromEnv = String(process.env.WW_PUBLIC_BASE || '').replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  return 'https://www.woonwekker.nl';
}

function pricingUrl() {
  return siteBase().replace(/\/$/, '') + '/prijzen/';
}

function accountUrl() {
  return siteBase().replace(/\/$/, '') + '/account/';
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function defaultHttpsJson(method, hostname, pathName, { headers = {}, body = null } = {}) {
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
                'Content-Type': headers['Content-Type'] || 'application/json',
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
              (json && (json.message || json.error || json.detail)) ||
                'Resend error ' + res.statusCode
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

function resendRequest(method, hostname, pathName, opts) {
  if (_resendRequestOverride) return _resendRequestOverride(method, hostname, pathName, opts);
  return defaultHttpsJson(method, hostname, pathName, opts);
}

/** Test-only: inject mocked Resend HTTP. Pass null to restore. */
function setResendRequestForTests(fn) {
  _resendRequestOverride = typeof fn === 'function' ? fn : null;
}

/**
 * Low-level send. Fail-closed without key (no throw, no pretend).
 * Throws only when key is present and Resend/network fails — callers catch.
 */
async function sendResendEmail({ to, subject, html, text }) {
  if (!resendConfigured()) {
    return { sent: false, reason: 'resend_unavailable' };
  }
  const email = String(to || '').trim();
  if (!email || !email.includes('@')) {
    return { sent: false, reason: 'no_recipient' };
  }
  const body = JSON.stringify({
    from: resendFrom(),
    to: [email],
    subject,
    html,
    text,
  });
  const json = await resendRequest('POST', 'api.resend.com', '/emails', {
    headers: {
      Authorization: 'Bearer ' + resendKey(),
      'Content-Type': 'application/json',
    },
    body,
  });
  return { sent: true, id: json && json.id };
}

/**
 * B — Bellen subscription created after paid mandate / first payment.
 * @param {{ email: string, trial: boolean, idealSepa?: boolean }} opts
 * trial: card 1-day trial then €18.50/mo
 * idealSepa: €18.50 paid now, sub starts in one month, no trial
 */
async function sendBellenActiveEmail({ email, trial, idealSepa }) {
  let bodyNl;
  if (idealSepa) {
    bodyNl =
      'Je Bellen-abonnement is actief. Je hebt nu €18,50 betaald; het abonnement loopt door voor €18,50 per maand (volgende incasso over een maand). Geen proefperiode.';
  } else if (trial) {
    bodyNl =
      'Je Bellen-abonnement is actief. Je hebt 1 dag proef; daarna €18,50 per maand. Opzeggen kan in je account.';
  } else {
    bodyNl =
      'Je Bellen-abonnement is actief (€18,50 per maand).';
  }
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#10254c">
  <p>Hoi,</p>
  <p>${escapeHtml(bodyNl)}</p>
  <p style="font-size:13px;color:#62718a"><a href="${escapeHtml(accountUrl())}">Account</a></p>
</body></html>`;
  // Nicole NL 2026-09-30. EN waits until a lang is known at send time (signup mail is NL-only).
  return sendResendEmail({
    to: email,
    subject: 'Woonwekker Bellen is actief',
    html,
    text: bodyNl + '\n\n' + accountUrl(),
  });
}

/**
 * C — Mollie charge failed (not open/pending; not €0 mandate create).
 */
async function sendBellenChargeFailedEmail({ email }) {
  const link = pricingUrl();
  const bodyNl =
    'Een betaling voor Bellen is mislukt. Bellen is niet ontgrendeld. Probeer het opnieuw via prijzen of je account.';
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#10254c">
  <p>Hoi,</p>
  <p>${escapeHtml(bodyNl)}</p>
  <p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>
</body></html>`;
  // Nicole NL 2026-09-30.
  return sendResendEmail({
    to: email,
    subject: 'Woonwekker Bellen — betaling mislukt',
    html,
    text: bodyNl + '\n\n' + link,
  });
}

/**
 * D — Bellen subscription cancelled.
 */
async function sendBellenCanceledEmail({ email }) {
  const bodyNl =
    'Je Bellen-abonnement is opgezegd. Bellen is niet langer actief. Je kunt later opnieuw starten via prijzen.';
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#10254c">
  <p>Hoi,</p>
  <p>${escapeHtml(bodyNl)}</p>
  <p style="font-size:13px;color:#62718a"><a href="${escapeHtml(pricingUrl())}">Prijzen</a></p>
</body></html>`;
  // Nicole NL 2026-09-30.
  return sendResendEmail({
    to: email,
    subject: 'Woonwekker Bellen opgezegd',
    html,
    text: bodyNl + '\n\n' + pricingUrl(),
  });
}

/**
 * Safe wrappers: never throw to callers; log and return { sent:false }.
 */
async function trySendBellenActive(opts) {
  try {
    return await sendBellenActiveEmail(opts);
  } catch (e) {
    console.error('[bellen-mail B]', e && e.message ? e.message : e);
    return { sent: false, reason: 'resend_error', error: e && e.message };
  }
}

async function trySendBellenChargeFailed(opts) {
  try {
    return await sendBellenChargeFailedEmail(opts);
  } catch (e) {
    console.error('[bellen-mail C]', e && e.message ? e.message : e);
    return { sent: false, reason: 'resend_error', error: e && e.message };
  }
}

async function trySendBellenCanceled(opts) {
  try {
    return await sendBellenCanceledEmail(opts);
  } catch (e) {
    console.error('[bellen-mail D]', e && e.message ? e.message : e);
    return { sent: false, reason: 'resend_error', error: e && e.message };
  }
}

module.exports = {
  resendConfigured,
  resendFrom,
  siteBase,
  pricingUrl,
  setResendRequestForTests,
  sendResendEmail,
  sendBellenActiveEmail,
  sendBellenChargeFailedEmail,
  sendBellenCanceledEmail,
  trySendBellenActive,
  trySendBellenChargeFailed,
  trySendBellenCanceled,
};
