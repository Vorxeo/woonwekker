'use strict';
/** 404 for hidden files; 410 Gone for removed pages (rewritten here with ?gone=1). */
module.exports = async function handler(req, res) {
  const url = String(req.url || '');
  const gone = (req.query && String(req.query.gone || '') === '1') || /[?&]gone=1\b/.test(url);
  res.statusCode = gone ? 410 : 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.end(gone ? 'Gone: this page has been removed. See https://woonwekker.nl/' : 'Not found');
};
