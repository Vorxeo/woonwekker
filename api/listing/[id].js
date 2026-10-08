'use strict';
const { loadPublicListings, sendJson } = require('../../lib/ww-gate.cjs');

/** Link to the original ad for one listing. Free: no subscription needed. */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  const id = String((req.query && req.query.id) || '').trim();
  let list;
  try {
    list = loadPublicListings();
  } catch {
    return sendJson(res, 500, { error: 'listings_unavailable' });
  }
  // Rows carry no id: the id is the row index in the public feed (same order as /listings.json).
  const found = list.find((p) => p.id != null && String(p.id) === id) || (/^\d+$/.test(id) ? list[Number(id)] : null);
  if (!found || !found.url) return sendJson(res, 404, { error: 'not_found' });
  return sendJson(res, 200, { id, url: found.url, source: found.sourceName || null, lastChecked: found.lastChecked || null });
};
