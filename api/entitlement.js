'use strict';
const { resolveEntitlement, checkoutAvailable, sendJson } = require('../lib/ww-gate.cjs');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  const ent = await resolveEntitlement(req, { refresh: true });
  const headers = {};
  if (ent.setCookie) headers['Set-Cookie'] = ent.setCookie;
  const exp = ent.payload && Number(ent.payload.exp);
  return sendJson(
    res,
    200,
    {
      plan: ent.plan,
      source: ent.plan === 'bellen' ? 'subscription' : null,
      checkoutAvailable: checkoutAvailable(),
      accessUntil: ent.plan === 'bellen' && Number.isFinite(exp) ? new Date(exp).toISOString() : null,
      cancelled: !!(ent.payload && ent.payload.cancelled),
      refreshed: !!ent.refreshed,
    },
    headers
  );
};
