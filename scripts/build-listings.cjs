'use strict';
/**
 * Build the public listing feed dist/listings.json from data/listings.full.json.
 * Applies lib/ww-listing-filter.cjs (status allowlist + MAX_AGE_DAYS freshness).
 * dist/listings.full.json is no longer written or served: a static file in dist/
 * wins over vercel.json rewrites, so it was public. The feed now carries the
 * original-ad url for everyone (no paywall on contact).
 * Usage: node scripts/build-listings.cjs [--now=ISO]
 */
const fs = require('fs');
const path = require('path');
const { publishable, publicRow, MAX_AGE_DAYS } = require('../lib/ww-listing-filter.cjs');

const root = path.join(__dirname, '..');
const arg = process.argv.find((a) => a.startsWith('--now='));
const now = arg ? Date.parse(arg.slice(6)) : Date.now();
if (!Number.isFinite(now)) throw new Error('bad --now');

const rows = JSON.parse(fs.readFileSync(path.join(root, 'data', 'listings.full.json'), 'utf8'));
const { kept, hidden } = publishable(rows, { now });
const feed = kept.map(publicRow);
fs.writeFileSync(path.join(root, 'dist', 'listings.json'), JSON.stringify(feed, null, 2) + '\n');
fs.rmSync(path.join(root, 'dist', 'listings.full.json'), { force: true });
const sources = [...new Set(feed.map((r) => r.sourceName))].sort();
console.log(JSON.stringify({ input: rows.length, published: feed.length, hidden, maxAgeDays: MAX_AGE_DAYS, now: new Date(now).toISOString(), sources }));
