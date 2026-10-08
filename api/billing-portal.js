'use strict';
/**
 * Subscription self-service. One function, several actions (Hobby plan function ceiling):
 *   POST /api/withdrawal  → ?action=withdraw  Overeenkomst ontbinden (herroeping). No login.
 *   POST /api/cancel      → ?action=cancel    Abonnement opzeggen. No login needed.
 *   GET  /api/billing-portal                  Status for the current subscriber cookie.
 *
 * Cancel: when the visitor has a subscriber cookie and the legacy provider is reachable, the
 * subscription is stopped right away and access stays until the end of the paid period (the
 * cookie is kept, not cleared). Otherwise the request is stored and confirmed, and handled
 * by hand. Nothing here claims success it did not get.
 */
const {
  getEntitlement,
  mollieEnabled,
  mollieRequest,
  resolveCustomerEmail,
  readJsonBody,
  sendJson,
} = require('../lib/ww-gate.cjs');
const {
  trySendBellenCanceled,
  trySendLegalRequestReceived,
  trySendLegalRequestOperator,
  resendConfigured,
} = require('../lib/ww-bellen-mail.cjs');
const legal = require('../lib/ww-legal-requests.cjs');

function actionOf(req, body) {
  let q = (req.query && req.query.action) || '';
  if (!q) {
    try {
      q = new URL(String(req.url || ''), 'http://x').searchParams.get('action') || '';
    } catch {}
  }
  return String(q || (body && body.action) || '').trim().toLowerCase();
}

function reply(req, res, status, obj, kind) {
  if (legal.wantsHtml(req)) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(legal.htmlConfirmation({ status, kind, result: obj }));
  }
  return sendJson(res, status, obj);
}

async function stopSubscription(customerId) {
  const subs = await mollieRequest('GET', `/customers/${encodeURIComponent(customerId)}/subscriptions?limit=10`);
  const list = (subs._embedded && subs._embedded.subscriptions) || [];
  const active = list.find((s) => s.status === 'active' || s.status === 'pending');
  if (!active) return { stopped: false, reason: 'no_active_subscription' };
  await mollieRequest('DELETE', `/customers/${encodeURIComponent(customerId)}/subscriptions/${active.id}`);
  return { stopped: true, subscriptionId: active.id };
}

async function handleRequest(req, res, kind, body) {
  const ip = legal.clientIp(req);
  if (legal.rateLimited(ip)) return reply(req, res, 429, { ok: false, error: 'rate_limited' }, kind);
  const check = legal.validateRequest(body);
  if (!check.ok) return reply(req, res, 400, { ok: false, error: 'invalid_request', fields: check.errors }, kind);
  const value = check.value;

  let mode = kind === 'withdraw' ? 'received' : 'request_stored';
  let accessUntil = null;
  let providerEmail = '';
  const ent = getEntitlement(req);
  if (kind === 'cancel' && ent.plan === 'bellen' && ent.payload && ent.payload.customerId && mollieEnabled()) {
    try {
      const out = await stopSubscription(ent.payload.customerId);
      if (out.stopped) {
        mode = 'cancelled';
        const exp = Number(ent.payload.exp);
        accessUntil = Number.isFinite(exp) ? new Date(exp).toISOString() : null;
        providerEmail = await resolveCustomerEmail(ent.payload.customerId, null).catch(() => '');
      }
    } catch (e) {
      console.error('[billing-portal cancel] provider cancel failed, storing request:', e && e.message);
    }
  }

  const record = legal.buildRecord({
    kind,
    value,
    req,
    extra: {
      mode,
      accessUntil,
      subscriber: ent.plan === 'bellen',
      customerId: (ent.payload && ent.payload.customerId) || null,
    },
  });
  const stored = legal.storeRequest(record);

  let emailed = false;
  if (resendConfigured()) {
    const consumer =
      mode === 'cancelled'
        ? await trySendBellenCanceled({ email: providerEmail || value.email, cancelledAt: record.receivedAt, accessUntil })
        : await trySendLegalRequestReceived({ kind, email: value.email, name: value.name, reference: record.reference, receivedAt: record.receivedAt, orderDate: value.orderDate });
    emailed = !!(consumer && consumer.sent === true);
    await trySendLegalRequestOperator({ record });
  }

  return reply(
    req,
    res,
    200,
    {
      ok: true,
      kind,
      mode,
      reference: record.reference,
      receivedAt: record.receivedAt,
      accessUntil,
      emailed,
      stored: stored.log || stored.file,
    },
    kind
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }
  let body = {};
  if (req.method === 'POST') {
    try {
      body = await readJsonBody(req);
    } catch {
      body = {};
    }
  }
  const action = actionOf(req, body);
  if (action === 'withdraw' || action === 'cancel') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed', allow: 'POST' });
    return handleRequest(req, res, action, body);
  }

  // Status for the current subscriber cookie (no secrets, no provider names).
  const ent = getEntitlement(req);
  if (ent.plan !== 'bellen') {
    return sendJson(res, 200, { plan: 'kijken', cancelUrl: '/opzeggen/', withdrawUrl: '/herroeping/#ontbinden' });
  }
  const exp = Number(ent.payload && ent.payload.exp);
  return sendJson(res, 200, {
    plan: 'bellen',
    accessUntil: Number.isFinite(exp) ? new Date(exp).toISOString() : null,
    cancelUrl: '/opzeggen/',
    withdrawUrl: '/herroeping/#ontbinden',
  });
};
