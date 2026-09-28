'use strict';
const { resolveEntitlement, mollieEnabled, sendJson } = require('../lib/ww-gate.cjs');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  const ent = await resolveEntitlement(req, { refresh: true });
  const headers = {};
  if (ent.setCookie) headers['Set-Cookie'] = ent.setCookie;
  return sendJson(
    res,
    200,
    {
      plan: ent.plan,
      source: ent.source,
      mollieConfigured: mollieEnabled(),
      refreshed: !!ent.refreshed,
    },
    headers
  );
};
