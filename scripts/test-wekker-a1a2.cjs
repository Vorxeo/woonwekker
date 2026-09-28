'use strict';
/**
 * Verified-delivery suite for Woonwekker A1+A2 (no browser).
 * Run: node scripts/test-wekker-a1a2.cjs
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const profileSrc = fs.readFileSync(path.join(root, 'dist/wekker-profile.js'), 'utf8');
const contentSrc = fs.readFileSync(path.join(root, 'dist/content.js'), 'utf8');
const enhSrc = fs.readFileSync(path.join(root, 'dist/enhancements.js'), 'utf8');
const accSrc = fs.readFileSync(path.join(root, 'dist/account.js'), 'utf8');

// Load WWWekker in node
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }
};
eval(profileSrc);
assert.ok(global.WWWekker, 'WWWekker global');
const W = global.WWWekker;

let passed = 0;
function ok(name, cond, detail) {
  if (!cond) {
    console.error('FAIL', name, detail || '');
    process.exitCode = 1;
    throw new Error(name);
  }
  console.log('PASS', name);
  passed++;
}

// --- A1 allowlist ---
{
  const dirty = {
    city: 'Amsterdam!!!'.padEnd(200, 'x'),
    budget: '1500abc',
    type: 'Villa',
    beds: 99,
    bio: 'I earn 5000 and my BSN is 123',
    income: '5plus',
    email: 'x@y.com',
    evil: 'drop table',
    garden: 'yes',
    requirePhoto: 1,
    query: 'x'.repeat(500)
  };
  const clean = W.sanitizeWekkerProfile(dirty);
  ok('strip unknown keys', !('bio' in clean) && !('income' in clean) && !('email' in clean) && !('evil' in clean));
  ok('city truncated', clean.city.length <= 80);
  ok('budget digits', clean.budget === '1500');
  ok('invalid type cleared', clean.type === '');
  ok('beds clamped', Number(clean.beds) <= 20);
  ok('garden bool', clean.garden === true);
  ok('query truncated', clean.query.length <= 200);
  ok('schema v', clean.v === 1);
}

// --- persist roundtrip ---
{
  const p = W.sanitizeWekkerProfile({ city: 'Utrecht', budget: 900, type: 'Studio', balcony: true });
  W.saveWekkerProfile(p);
  const loaded = W.loadWekkerProfile();
  ok('roundtrip city', loaded.city === 'Utrecht');
  ok('roundtrip type', loaded.type === 'Studio');
  ok('hasActiveCriteria', W.hasActiveCriteria(loaded) === true);
  W.clearWekkerProfile();
  ok('clear empties', W.hasActiveCriteria(W.loadWekkerProfile()) === false);
}

// --- NL parse deterministic ---
{
  const p = W.parseNlToProfile('studio in Utrecht tot €900 met balkon');
  ok('nl type', p.type === 'Studio');
  ok('nl city', /utrecht/i.test(p.city));
  ok('nl budget', p.budget === '900');
  ok('nl balcony', p.balcony === true);
}

// --- map to filters ---
{
  const filters = { city: '', budget: '', beds: '', type: '', area: '', minBudget: '', garden: false, balcony: false, energy: false, ptype: '', sort: 'source' };
  W.applyProfileToFilters({ city: 'Delft', budget: '1200', type: 'Kamer', beds: 1 }, filters);
  ok('filters.city', filters.city === 'Delft');
  ok('filters.budget', filters.budget === '1200');
  ok('filters.type', filters.type === 'Kamer');
}

// --- A2 explain deterministic ---
{
  const listing = {
    city: 'Utrecht', address: 'Teststraat 1', postalCode: '3511 AA',
    price: '850', propertyType: 'Studio', bedrooms: '1', livingArea: '28',
    garden: 'false', balcony: 'true', energyLabel: 'B', photo: 'https://example.com/a.jpg'
  };
  const profile = W.sanitizeWekkerProfile({
    city: 'Utrecht', budget: '900', type: 'Studio', beds: 1, balcony: true, requirePhoto: true
  });
  const expl = W.explainListing(listing, profile);
  ok('explain not null', !!expl);
  ok('pass city', expl.passes.some((x) => x.id === 'whyPassCity'));
  ok('pass budget', expl.passes.some((x) => x.id === 'whyPassBudget'));
  ok('pass type', expl.passes.some((x) => x.id === 'whyPassType'));
  ok('pass balcony', expl.passes.some((x) => x.id === 'whyPassBalcony'));
  ok('pass photo', expl.passes.some((x) => x.id === 'whyPassPhoto'));
  ok('no fails when match', expl.fails.length === 0);

  const bad = W.explainListing({ ...listing, city: 'Amsterdam', price: '2000', propertyType: 'Huis', balcony: 'false', photo: '' }, profile);
  ok('fail city', bad.fails.some((x) => x.id === 'whyFailCity'));
  ok('fail budget', bad.fails.some((x) => x.id === 'whyFailBudget'));
  ok('fail type', bad.fails.some((x) => x.id === 'whyFailType'));
  ok('fail photo', bad.fails.some((x) => x.id === 'whyFailPhoto'));
}

// --- fail-closed ---
{
  ok('explain null empty', W.explainListing({ city: 'X' }, W.emptyProfile()) === null);
  ok('hasActive false empty', W.hasActiveCriteria(W.emptyProfile()) === false);
  ok('query alone not active', W.hasActiveCriteria({ query: 'hello world' }) === false);
}

// --- i18n keys present ---
{
  const json = contentSrc.replace(/^const copy=/, '').replace(/;\s*$/, '');
  const copy = JSON.parse(json);
  const langs = ['nl', 'en', 'es', 'pl'];
  const need = ['whyPassBudget', 'whyFailPhoto', 'whyNeedProfile', 'wekkerProfileTitle', 'whySummaryPass'];
  for (const lang of langs) {
    for (const k of need) {
      ok(`i18n ${lang}.${k}`, !!(copy[lang] && copy[lang][k]));
    }
  }
  const blob = JSON.stringify(copy).toLowerCase();
  for (const bad of ['ia garante', 'perfect fit', 'ai score', 'jev', 'llm']) {
    ok('no overclaim ' + bad, !blob.includes(bad));
  }
}

// --- wiring present ---
ok('enhancements injects panel', /injectWekkerProfilePanel/.test(enhSrc));
ok('enhancements why on cards', /wwWhyHtmlFor/.test(enhSrc));
ok('account sanitize zoek', /sanitizeZoekprofielen|sanitizeZoekEntry/.test(accSrc));

// --- non-goals not introduced in A1/A2 surface ---
{
  // New module must be clean; content.js may mention alerts historically — check we added no A3 job.
  const bans = [
    /ranked.?alert/i,
    /digest/i,
    /typesafe/i,
    /\bJev\b/,
    /\bLLM\b/,
    /openai/i,
    /anthropic/i,
    /AI Pro/i,
    /ia garante/i,
    /perfect fit/i,
    /ai score/i,
    /resend/i
  ];
  for (const re of bans) {
    ok('wekker-profile clean ' + re, !re.test(profileSrc));
  }
  // enhancements A1/A2 block must not call network for profile
  const a1a2 = enhSrc.slice(enhSrc.indexOf('A1+A2 wekker'));
  ok('enhancements A1A2 no fetch', !/fetch\(/.test(a1a2));
  ok('enhancements A1A2 no resend', !/resend/i.test(a1a2));
}

console.log('TOTAL_PASSED', passed);
