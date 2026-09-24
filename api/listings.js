'use strict';
const { getEntitlement, loadFullListings, redactListing, sendJson } = require('../lib/ww-gate.cjs');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  let list;
  try {
    list = loadFullListings();
  } catch (e) {
    return sendJson(res, 500, { error: 'listings_unavailable' });
  }
  const ent = getEntitlement(req);
  const out = ent.plan === 'bellen' ? list : list.map(redactListing);
  const body = JSON.stringify(out);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  if (ent.plan !== 'bellen') res.setHeader('X-WW-Source', 'redacted');
  res.end(body);
};
