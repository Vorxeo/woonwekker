'use strict';
const {
  getEntitlement,
  mollieEnabled,
  mollieRequest,
  readJsonBody,
  sendJson,
  cookieHeader,
} = require('../lib/ww-gate.cjs');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }
  const ent = getEntitlement(req);
  if (ent.plan !== 'bellen' || !ent.payload || !ent.payload.customerId) {
    return sendJson(res, 401, { error: 'not_entitled' });
  }
  if (!mollieEnabled()) return sendJson(res, 503, { error: 'payments_unavailable' });

  let body = {};
  if (req.method === 'POST') {
    try {
      body = await readJsonBody(req);
    } catch {
      body = {};
    }
  }
  const customerId = ent.payload.customerId;
  try {
    const subs = await mollieRequest('GET', `/customers/${encodeURIComponent(customerId)}/subscriptions?limit=10`);
    const list = (subs._embedded && subs._embedded.subscriptions) || [];
    const active = list.find((s) => s.status === 'active' || s.status === 'pending') || list[0];
    const wantCancel = body.cancel === true || body.cancel === '1' || body.action === 'cancel';
    if (wantCancel && active) {
      await mollieRequest('DELETE', `/customers/${encodeURIComponent(customerId)}/subscriptions/${active.id}`);
      res.setHeader('Set-Cookie', cookieHeader('', { clear: true }));
      return sendJson(res, 200, { canceled: true, plan: 'kijken' });
    }
    return sendJson(res, 200, {
      customerId,
      subscriptionId: active ? active.id : null,
      status: active ? active.status : null,
      cancelHint: 'POST {"cancel":true} to cancel (1-klik opzeggen). 14-day money-back per site copy.',
    });
  } catch (e) {
    return sendJson(res, 502, { error: e.message });
  }
};
