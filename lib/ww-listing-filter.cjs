'use strict';
/**
 * Which listings may be shown publicly (ACM 2021: no rented, unavailable or stale ads).
 *
 * Rules, all required:
 *  1. status is one the source marks as open: beschikbaar, Nieuw, Uitgelicht.
 *     Anything else (inonderhandeling, verhuurd, onder optie, empty, unknown) is hidden.
 *  2. scrapedAt (the moment our import last saw the ad live at its source) is a valid date
 *     no more than MAX_AGE_DAYS before the reference time. No date = stale = hidden.
 *  3. the ad has an https url and a known source (funda, kamernet, pararius).
 *
 * The same threshold is applied in dist/app.js at view time, so the live site also hides
 * ads that go stale after the last build.
 */
const MAX_AGE_DAYS = 30;
const OPEN_STATUSES = new Set(['beschikbaar', 'nieuw', 'uitgelicht']);
const SOURCES = { funda: 'Funda', kamernet: 'Kamernet', pararius: 'Pararius' };

function sourceKey(row) {
  return String((row && row.source) || '').trim().toLowerCase();
}
function sourceName(row) {
  return SOURCES[sourceKey(row)] || '';
}
function lastCheckedMs(row) {
  const raw = row && (row.scrapedAt || row.lastChecked);
  if (!raw) return null;
  const t = Date.parse(String(raw));
  return Number.isFinite(t) ? t : null;
}

/** @returns {null|string} null when publishable, else the reason it is hidden */
function hiddenReason(row, nowMs = Date.now(), maxAgeDays = MAX_AGE_DAYS) {
  if (!row || typeof row !== 'object') return 'invalid';
  const status = String(row.status || '').trim().toLowerCase();
  if (!OPEN_STATUSES.has(status)) return 'status:' + (status || 'missing');
  const checked = lastCheckedMs(row);
  if (checked == null) return 'no_date';
  if (nowMs - checked > maxAgeDays * 24 * 60 * 60 * 1000) return 'stale';
  if (!/^https:\/\//i.test(String(row.url || ''))) return 'no_url';
  if (!sourceName(row)) return 'unknown_source';
  return null;
}

function publishable(rows, { now = Date.now(), maxAgeDays = MAX_AGE_DAYS } = {}) {
  const kept = [];
  const hidden = {};
  for (const row of rows || []) {
    const reason = hiddenReason(row, now, maxAgeDays);
    if (reason) hidden[reason] = (hidden[reason] || 0) + 1;
    else kept.push(row);
  }
  return { kept, hidden };
}

/** Public feed row: original fields, plus lastChecked (YYYY-MM-DD) and sourceName. Import metadata removed. */
function publicRow(row) {
  const out = { ...row };
  const checked = lastCheckedMs(row);
  for (const k of ['scrapedAt', 'publishDate', 'listedDate', 'createDate', 'lastUpdated', 'batchDate']) delete out[k];
  out.lastChecked = checked == null ? '' : new Date(checked).toISOString().slice(0, 10);
  out.sourceName = sourceName(row);
  return out;
}

module.exports = { MAX_AGE_DAYS, OPEN_STATUSES, SOURCES, sourceName, lastCheckedMs, hiddenReason, publishable, publicRow };
