'use strict';
const { loadPublicListings, sendJson } = require('../lib/ww-gate.cjs');

/**
 * Public listing feed: the same filtered rows as /listings.json (open status, known source,
 * checked within the freshness threshold). Links to the original ad are free for everyone.
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  let list;
  try {
    list = loadPublicListings();
  } catch (e) {
    return sendJson(res, 500, { error: 'listings_unavailable' });
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.end(JSON.stringify(list));
};
