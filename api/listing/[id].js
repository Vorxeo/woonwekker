'use strict';
const { getEntitlement, loadFullListings, sendJson } = require('../../lib/ww-gate.cjs');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  const ent = getEntitlement(req);
  if (ent.plan !== 'bellen') return sendJson(res, 402, { error: 'payment_required', plan: 'kijken' });
  const id = String((req.query && req.query.id) || '').trim();
  let list;
  try {
    list = loadFullListings();
  } catch {
    return sendJson(res, 500, { error: 'listings_unavailable' });
  }
  const found = list.find((p, i) => String(p.id != null ? p.id : i) === id) || list[Number(id)];
  if (!found || !found.url) return sendJson(res, 404, { error: 'not_found' });
  return sendJson(res, 200, { id, url: found.url });
};
