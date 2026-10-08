'use strict';
/**
 * Bellen customer emails via Resend: B trial start, receipt per charge, C failed charge,
 * D cancellation, and withdrawal/cancellation request confirmations.
 * Side-effect only: missing key or Resend errors never change unlock/entitlement.
 * Reuses RESEND_API_KEY, else woonwekker_resend_api_key, plus RESEND_FROM (same as signup confirm in ww-auth.cjs).
 * Bodies are short and factual: Dutch first, then an English paragraph.
 */
const https = require('https');
const { professionalEmail } = require('./ww-mail-layout.cjs');

/** @type {null | ((method: string, hostname: string, pathName: string, opts: object) => Promise<any>)} */
let _resendRequestOverride = null;

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

function pageUrl(slug) {
  return siteBase().replace(/\/$/, '') + '/' + slug + '/';
}

/** Dutch and English date (and optional time) in Europe/Amsterdam. */
function fmtWhen(input, { time = false } = {}) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return { nl: '', en: '' };
  const opts = { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'long', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) };
  return {
    nl: new Intl.DateTimeFormat('nl-NL', opts).format(d) + (time ? ' (Nederlandse tijd)' : ''),
    en: new Intl.DateTimeFormat('en-GB', opts).format(d) + (time ? ' (Amsterdam time)' : ''),
  };
}

const PRICE_NL = 'totaalprijs €18,50 per maand';
/** Company identifiers verified in the repo (footer). Legal name and address are not on file yet. */
const COMPANY_LINE = 'Woonwekker · KvK-nummer 42108778 · btw-nummer NL005499683B86 · woonwekker.nl';
const PRICE_EN = 'total price €18.50 per month';

/**
 * B — signup / trial start, after the subscription is created.
 * @param {{ email: string, trial: boolean, idealSepa?: boolean, firstChargeDate?: string }} opts
 * trial: the first day is free; firstChargeDate (YYYY-MM-DD, the subscription start) is stated when known.
 * idealSepa: legacy first payment already charged; no free day.
 */
async function sendBellenActiveEmail({ email, trial, idealSepa, firstChargeDate }) {
  const cancel = pageUrl('opzeggen');
  const withdraw = pageUrl('herroeping');
  const paragraphs = ['Hoi,'];
  if (idealSepa) {
    paragraphs.push('Je Bellen-abonnement is actief. Je hebt nu €18,50 betaald voor de eerste maand. Daarna betaal je ' + PRICE_NL + ', automatisch elke maand, tot je opzegt. Geen proefperiode.');
  } else if (trial) {
    const first = firstChargeDate ? fmtWhen(firstChargeDate + 'T12:00:00Z') : null;
    paragraphs.push(
      'Je Bellen-abonnement is gestart. Je hebt 1 dag proef.' + (first && first.nl ? ' De eerste betaling van €18,50 is op ' + first.nl + '.' : '') + ' Daarna betaal je ' + PRICE_NL + ', automatisch elke maand, tot je opzegt. Zeg je op voor de eerste betaling, dan betaal je niets.'
    );
  } else {
    paragraphs.push('Je Bellen-abonnement is actief: ' + PRICE_NL + ', automatisch elke maand, tot je opzegt.');
  }
  paragraphs.push('Opzeggen kan altijd online, zonder opzegtermijn: ' + cancel);
  paragraphs.push('Je hebt 14 dagen herroepingsrecht. Je vroeg om Bellen direct te laten starten; ontbind je binnen 14 dagen, dan betaal je alleen een evenredig bedrag voor de periode waarin Bellen al is geleverd. Informatie en het formulier: ' + withdraw);
  if (trial && !idealSepa) {
    const first = firstChargeDate ? fmtWhen(firstChargeDate + 'T12:00:00Z') : null;
    paragraphs.push('EN: Your Bellen subscription has started. The first day is free.' + (first && first.en ? ' The first payment of €18.50 is on ' + first.en + '.' : '') + ' After that you pay a ' + PRICE_EN + ', automatically every month, until you cancel. Cancel online at any time: ' + cancel + '. You have a 14-day right of withdrawal: ' + withdraw);
  } else {
    paragraphs.push('EN: Your Bellen subscription is active: ' + PRICE_EN + ', renewing every month until you cancel. Cancel online at any time: ' + cancel + '. Right of withdrawal (14 days): ' + withdraw);
  }
  paragraphs.push(COMPANY_LINE);
  const mail = professionalEmail({ paragraphs, link: cancel, linkLabel: 'Abonnement opzeggen / Cancel subscription' });
  return sendResendEmail({
    to: email,
    subject: 'Woonwekker Bellen is actief',
    html: mail.html,
    text: mail.text,
  });
}

/** Payment confirmation for every paid charge above €0 (not an invoice). */
async function sendBellenReceiptEmail({ email, amount, paidAt, paymentId }) {
  const when = fmtWhen(paidAt || Date.now());
  const value = String(amount || '').replace('.', ',');
  const paragraphs = [
    'Hoi,',
    'We hebben je betaling van €' + value + ' voor Woonwekker Bellen (1 maand) ontvangen op ' + when.nl + '.' + (paymentId ? ' Referentie: ' + paymentId + '.' : ''),
    'Het abonnement loopt door voor ' + PRICE_NL + ' tot je opzegt. Opzeggen kan altijd online: ' + pageUrl('opzeggen'),
    'Dit is een betalingsbevestiging, geen factuur.',
    'EN: We received your payment of €' + String(amount || '') + ' for Woonwekker Bellen (1 month) on ' + when.en + '.' + (paymentId ? ' Reference: ' + paymentId + '.' : '') + ' This is a payment confirmation, not an invoice. Cancel online at any time: ' + pageUrl('opzeggen'),
  ];
  paragraphs.push(COMPANY_LINE);
  const mail = professionalEmail({ paragraphs, link: pageUrl('opzeggen'), linkLabel: 'Abonnement opzeggen / Cancel subscription' });
  return sendResendEmail({ to: email, subject: 'Woonwekker Bellen — betaling ontvangen', html: mail.html, text: mail.text });
}

async function sendBellenChargeFailedEmail({ email }) {
  const link = pricingUrl();
  const bodyNl =
    'Een betaling voor Bellen is mislukt. Er is niets afgeschreven. Zoeken en de links naar advertenties blijven gratis; kijk op prijzen of je opnieuw wilt starten.';
  const mail = professionalEmail({
    paragraphs: ['Hoi,', bodyNl, 'EN: A payment for Bellen failed. Nothing was charged. Searching and the links to ads stay free.'],
    link,
    linkLabel: 'Prijzen',
  });
  return sendResendEmail({
    to: email,
    subject: 'Woonwekker Bellen — betaling mislukt',
    html: mail.html,
    text: mail.text,
  });
}

/** D — cancellation confirmation. accessUntil: end of the paid period, when known. */
async function sendBellenCanceledEmail({ email, cancelledAt, accessUntil }) {
  const on = fmtWhen(cancelledAt || Date.now());
  const until = accessUntil ? fmtWhen(accessUntil) : null;
  const paragraphs = [
    'Hoi,',
    'Je Bellen-abonnement is opgezegd op ' + on.nl + '. Er wordt niets meer afgeschreven.' + (until && until.nl ? ' Je houdt toegang tot en met ' + until.nl + '.' : ''),
    'Je kunt later opnieuw starten via prijzen.',
    'EN: Your Bellen subscription was cancelled on ' + on.en + '. Nothing more will be charged.' + (until && until.en ? ' You keep access until ' + until.en + '.' : ''),
  ];
  paragraphs.push(COMPANY_LINE);
  const mail = professionalEmail({ paragraphs, link: pricingUrl(), linkLabel: 'Prijzen' });
  return sendResendEmail({
    to: email,
    subject: 'Woonwekker Bellen opgezegd',
    html: mail.html,
    text: mail.text,
  });
}

/** Confirmation that a withdrawal (herroeping) or cancellation request was received. */
async function sendLegalRequestReceivedEmail({ kind, email, name, reference, receivedAt, orderDate }) {
  const when = fmtWhen(receivedAt, { time: true });
  const withdraw = kind === 'withdraw';
  const paragraphs = [
    'Hoi ' + String(name || '').trim() + ',',
    withdraw
      ? 'We hebben je verzoek tot ontbinding (herroeping) van Woonwekker Bellen ontvangen op ' + when.nl + '. Referentie: ' + reference + '.' + (orderDate ? ' Opgegeven besteldatum: ' + orderDate + '.' : '')
      : 'We hebben je opzegging van Woonwekker Bellen ontvangen op ' + when.nl + '. Referentie: ' + reference + '. Na verwerking wordt er niets meer afgeschreven; je houdt toegang tot het einde van de betaalde periode.',
    withdraw
      ? 'Je krijgt je betalingen binnen 14 dagen terug, met hetzelfde betaalmiddel. Heb je gevraagd om Bellen direct te laten starten, dan houden we een evenredig bedrag in voor de periode waarin Bellen al is geleverd.'
      : 'Wil je binnen 14 dagen na aanmelding je geld terug, gebruik dan Overeenkomst ontbinden: ' + pageUrl('herroeping') + '#ontbinden',
    withdraw
      ? 'EN: We received your request to withdraw from Woonwekker Bellen on ' + when.en + '. Reference: ' + reference + '. We refund your payments within 14 days using the same means of payment, minus a proportionate amount if you asked for Bellen to start immediately.'
      : 'EN: We received your cancellation of Woonwekker Bellen on ' + when.en + '. Reference: ' + reference + '. Once processed nothing more is charged; you keep access until the end of the paid period.',
  ];
  paragraphs.push(COMPANY_LINE);
  const mail = professionalEmail({ paragraphs });
  return sendResendEmail({
    to: email,
    subject: withdraw ? 'Woonwekker — ontbinding ontvangen (' + reference + ')' : 'Woonwekker — opzegging ontvangen (' + reference + ')',
    html: mail.html,
    text: mail.text,
  });
}

/** Operator copy of a withdrawal/cancel request. Only when WW_LEGAL_INBOX is set (server-only env). */
function legalInbox() {
  const v = String(process.env.WW_LEGAL_INBOX || '').trim();
  return v.includes('@') ? v : '';
}
async function sendLegalRequestOperatorEmail({ record }) {
  const to = legalInbox();
  if (!to) return { sent: false, reason: 'no_legal_inbox' };
  const lines = Object.entries(record).map(([k, v]) => k + ': ' + (v == null ? '' : String(v)));
  const mail = professionalEmail({ paragraphs: ['Nieuw verzoek via woonwekker.nl (' + record.type + ').', lines.join('\n'), 'Wettelijke termijn: verwerk een ontbinding en betaal binnen 14 dagen terug.'] });
  return sendResendEmail({ to, subject: '[Woonwekker] ' + record.type + ' ' + record.reference, html: mail.html, text: mail.text });
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

async function trySendBellenReceipt(opts) {
  try {
    return await sendBellenReceiptEmail(opts);
  } catch (e) {
    console.error('[bellen-mail receipt]', e && e.message ? e.message : e);
    return { sent: false, reason: 'resend_error', error: e && e.message };
  }
}

async function trySendLegalRequestReceived(opts) {
  try {
    return await sendLegalRequestReceivedEmail(opts);
  } catch (e) {
    console.error('[legal-mail consumer]', e && e.message ? e.message : e);
    return { sent: false, reason: 'resend_error', error: e && e.message };
  }
}

async function trySendLegalRequestOperator(opts) {
  try {
    return await sendLegalRequestOperatorEmail(opts);
  } catch (e) {
    console.error('[legal-mail operator]', e && e.message ? e.message : e);
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
  sendBellenReceiptEmail,
  sendLegalRequestReceivedEmail,
  sendLegalRequestOperatorEmail,
  legalInbox,
  trySendBellenReceipt,
  trySendLegalRequestReceived,
  trySendLegalRequestOperator,
  trySendBellenActive,
  trySendBellenChargeFailed,
  trySendBellenCanceled,
};
