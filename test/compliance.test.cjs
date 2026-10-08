'use strict';
/**
 * Compliance guarantees (2026-10-08): service framing, sources, no paywall on contact,
 * /plaats/ gone, consent boxes, footer legal block on every page, legal pages,
 * no visitor-facing payment-provider or Vorxeo names, withdrawal/cancel without login, mails.
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

process.env.WW_ENTITLEMENT_SECRET = 'test-entitlement-secret-compliance';
process.env.WW_PUBLIC_BASE = 'https://www.woonwekker.nl';
process.env.WW_LEGAL_LOG_FILE = path.join(os.tmpdir(), 'ww-legal-test-' + process.pid + '.jsonl');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const read = (rel) => fs.readFileSync(path.join(dist, rel), 'utf8');
const LANGS = ['nl', 'en', 'es', 'pl', 'pt', 'ro', 'bg', 'it'];

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}
const files = walk(dist);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const textFiles = files.filter((f) => /\.(html|js|css|json|xml|txt|webmanifest)$/.test(f));

function loadCopy() {
  const sandbox = {};
  vm.runInNewContext(read('content.js') + '\nthis.copy=copy;', sandbox);
  return sandbox.copy;
}

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    raw: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(raw) {
      this.raw = raw || '';
      try { this.body = JSON.parse(this.raw); } catch { this.body = this.raw; }
    },
  };
}

describe('service framing and sources', () => {
  it('shows the search-service notice on the key pages and in all 8 languages', () => {
    for (const rel of ['index.html', 'huizen/index.html', 'kamers/index.html', 'prijzen/index.html', 'faq/index.html', 'voorwaarden/index.html']) {
      const html = read(rel);
      assert.match(html, /<aside class="ww-service-notice" role="note"><p data-t="serviceNotice">Woonwekker is een zoek- en alertdienst\./, rel);
      assert.match(html, /rechtstreeks contact op met de aanbieder/, rel);
    }
    const copy = loadCopy();
    for (const lang of LANGS) {
      assert.ok(copy[lang].serviceNotice && copy[lang].serviceNotice.length > 60, lang);
      assert.ok(copy[lang].footerSources, lang);
      const faqTitles = copy[lang].faqItems.map((q) => q[1]).join(' ');
      assert.match(faqTitles, /Funda, Kamernet, Pararius/, 'FAQ names the sources: ' + lang);
    }
    assert.match(copy.en.serviceNotice, /search and alert service/);
    assert.match(copy.en.serviceNotice, /contact the advertiser directly/);
  });

  it('names the sources from the data on every page and on every listing', () => {
    const rows = JSON.parse(read('listings.json'));
    const names = [...new Set(rows.map((r) => r.sourceName))].sort();
    assert.deepEqual(names, ['Funda', 'Kamernet', 'Pararius']);
    for (const f of htmlFiles) {
      assert.match(fs.readFileSync(f, 'utf8'), /<span class="ww-source-list">Funda, Kamernet, Pararius<\/span>/, path.relative(dist, f));
    }
    const app = read('app.js');
    assert.match(app, /class="ww-card-source"/);
    assert.match(app, /class="ww-source-block"/);
  });

  it('publishes only open, fresh listings with a visible last-checked date', () => {
    const { MAX_AGE_DAYS, hiddenReason, publishable } = require('../lib/ww-listing-filter.cjs');
    assert.equal(MAX_AGE_DAYS, 30);
    const now = Date.parse('2026-10-08T12:00:00Z');
    const base = { url: 'https://www.funda.nl/x', source: 'funda', city: 'Utrecht', status: 'beschikbaar', scrapedAt: '2026-10-01T00:00:00Z' };
    assert.equal(hiddenReason(base, now), null);
    assert.ok(hiddenReason({ ...base, status: 'inonderhandeling' }, now));
    assert.ok(hiddenReason({ ...base, status: 'verhuurd' }, now));
    assert.ok(hiddenReason({ ...base, scrapedAt: '2026-08-01T00:00:00Z' }, now), 'older than 30 days');
    assert.ok(hiddenReason({ ...base, scrapedAt: undefined }, now), 'no date means stale');
    assert.equal(publishable([base, { ...base, status: 'inonderhandeling' }], { now }).kept.length, 1);
    const rows = JSON.parse(read('listings.json'));
    assert.ok(rows.length > 0);
    for (const r of rows) {
      assert.match(r.lastChecked, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(['beschikbaar', 'nieuw', 'uitgelicht', ''].includes(String(r.status || '').toLowerCase()) || !r.status, r.status);
      assert.notEqual(String(r.status).toLowerCase(), 'inonderhandeling');
      assert.ok(r.sourceName);
      assert.ok(r.city, 'every listing keeps its city');
      assert.equal('scrapedAt' in r, false);
    }
    assert.match(read('app.js'), /WW_MAX_AGE_DAYS=30/);
  });

  it('keeps the full data file private and out of dist', () => {
    assert.equal(fs.existsSync(path.join(dist, 'listings.full.json')), false);
    const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
    assert.ok(vercel.rewrites.some((r) => r.source === '/listings.full.json' && r.destination === '/api/not-found'));
  });
});

describe('/plaats/ removed', () => {
  it('has no page, link, sitemap entry or intake API', () => {
    assert.equal(fs.existsSync(path.join(dist, 'plaats')), false);
    assert.equal(fs.existsSync(path.join(root, 'api', 'plaats.js')), false);
    for (const f of textFiles) {
      const src = fs.readFileSync(f, 'utf8');
      assert.equal(/["'(]\/plaats\/?["'#?)]|\/api\/plaats/.test(src), false, path.relative(dist, f));
    }
    assert.equal(read('sitemap.xml').includes('/plaats'), false);
  });

  it('answers the old URL with 410 Gone', async () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
    for (const src of ['/plaats', '/plaats/', '/plaats/:path*']) {
      assert.ok(vercel.rewrites.some((r) => r.source === src && r.destination === '/api/not-found?gone=1'), src);
    }
    const notFound = require('../api/not-found.js');
    const res = mockRes();
    await notFound({ url: '/api/not-found?gone=1', query: { gone: '1' }, headers: {} }, res);
    assert.equal(res.statusCode, 410);
    const res2 = mockRes();
    await notFound({ url: '/api/not-found', query: {}, headers: {} }, res2);
    assert.equal(res2.statusCode, 404);
  });

  it('redirects the old /legal draft to the real terms', () => {
    assert.equal(fs.existsSync(path.join(dist, 'legal')), false);
    const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
    assert.ok(vercel.redirects.some((r) => r.source === '/legal/' && r.destination === '/voorwaarden/'));
    assert.match(read('signup/index.html') + read('account.js'), /href="\/voorwaarden\/"/);
  });
});

describe('no paywall on contact', () => {
  it('serves the original-ad link without a subscription', async () => {
    const handler = require('../api/listing/[id].js');
    const res = mockRes();
    await handler({ method: 'GET', query: { id: '0' }, headers: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.match(res.body.url, /^https:\/\//);
    assert.ok(res.body.source);
    const listings = require('../api/listings.js');
    const res2 = mockRes();
    await listings({ method: 'GET', headers: {} }, res2);
    assert.equal(res2.statusCode, 200);
    assert.ok(res2.body.length > 0 && res2.body.every((r) => typeof r.url === 'string'));
    assert.equal('x-ww-source' in res2.headers, false);
  });

  it('has no locked-source or paywall code paths in the front end', () => {
    const js = read('app.js') + read('account.js') + read('enhancements.js');
    for (const re of [/payment_required/, /sourceLocked/, /unlockSource/, /photosLocked/, /gateSourceLink/, /ww-detail-locked"/]) {
      assert.equal(re.test(js), false, String(re));
    }
    assert.match(read('app.js'), /target="_blank" rel="noopener noreferrer nofollow"/);
  });
});

describe('checkout consent', () => {
  it('has two separate, unticked, required consent boxes and states trial, price, renewal and cancelling', () => {
    const html = read('prijzen/index.html');
    const boxes = [...html.matchAll(/<input type="checkbox"[^>]*>/g)].map((m) => m[0]);
    const terms = boxes.find((b) => b.includes('id="consent-terms"'));
    const now = boxes.find((b) => b.includes('id="consent-immediate"'));
    assert.ok(terms && now);
    for (const b of [terms, now]) {
      assert.match(b, /\brequired\b/);
      assert.equal(/\bchecked\b/.test(b), false);
    }
    assert.match(html, /<a href="\/voorwaarden\/"[^>]*data-t="consentTermsLink"/);
    assert.match(html, /id="checkout-submit" disabled/);
    for (const key of ['checkoutTrialLabel', 'checkoutPriceLabel', 'checkoutRenewLabel', 'checkoutCancelLabel', 'checkoutUnavailable']) {
      assert.match(html, new RegExp(`data-t="${key}"`), key);
    }
    assert.match(html, /totaalprijs €18,50 per maand/);
    assert.equal(/incl\.?\s*btw/i.test(html), false);
  });
});

describe('footer legal block in the static HTML of every dist page', () => {
  it('carries KvK, btw and the legal links on every page', () => {
    assert.ok(htmlFiles.length > 100);
    for (const f of htmlFiles) {
      const html = fs.readFileSync(f, 'utf8');
      const rel = path.relative(dist, f);
      const footer = html.slice(html.lastIndexOf('<footer'));
      assert.match(footer, /42108778/, rel);
      assert.match(footer, /NL005499683B86/, rel);
      for (const href of ['/voorwaarden/', '/privacy/', '/terugbetaling/', '/herroeping/', '/opzeggen/', '/herroeping/#ontbinden']) {
        assert.ok(footer.includes(`href="${href}"`), rel + ' ' + href);
      }
    }
  });
});

describe('legal pages', () => {
  const pages = ['voorwaarden', 'privacy', 'terugbetaling', 'herroeping', 'opzeggen'];
  it('exist in 8 languages and are in the sitemap', () => {
    const sitemap = read('sitemap.xml');
    for (const slug of pages) {
      const html = read(slug + '/index.html');
      for (const lang of LANGS) assert.match(html, new RegExp(`data-ww-lang="${lang}"`), slug + ' ' + lang);
      assert.ok(sitemap.includes(`<loc>https://www.woonwekker.nl/${slug}/</loc>`), slug);
      assert.match(html, new RegExp(`<link rel="canonical" href="https://www.woonwekker.nl/${slug}/"`));
    }
    const robots = read('robots.txt');
    for (const slug of pages) assert.equal(new RegExp(`Disallow: /${slug}/`).test(robots), false);
  });

  it('includes the official model withdrawal form and a no-login withdrawal form', () => {
    const html = read('herroeping/index.html');
    assert.match(html, /Modelformulier voor herroeping/i);
    assert.match(html, /<section[^>]*id="ontbinden"/);
    assert.match(html, /<form[^>]*id="ww-withdraw-form"[^>]*data-ww-request="withdraw"/);
    assert.match(html, /action="\/api\/withdrawal"/);
    const cancel = read('opzeggen/index.html');
    assert.match(cancel, /<form[^>]*id="ww-cancel-form"/);
    assert.match(cancel, /action="\/api\/cancel"/);
  });

  it('keeps the Google Ads consent section in the privacy copy and names no payment provider', () => {
    const copy = loadCopy();
    for (const lang of LANGS) {
      const titles = copy[lang].privacySections.map((s) => s[0]);
      assert.ok(titles.includes('Google Ads'), lang);
    }
  });
});

describe('visitor-facing text', () => {
  it('names no payment provider and never Vorxeo', () => {
    for (const f of textFiles) {
      const src = fs.readFileSync(f, 'utf8');
      assert.equal(/mollie/i.test(src), false, 'mollie in ' + path.relative(dist, f));
      assert.equal(/vorxeo/i.test(src), false, 'vorxeo in ' + path.relative(dist, f));
    }
  });

  it('drops the unverified claims', () => {
    const bad = [/1-klik/i, /one-click cancel/i, /verborgen cent/i, /whatsapp/i, /<\s*60\s*s/i, /beste prijzen/i, /lowest prices/i, /expats beginnen/i, /incl\.?\s*btw/i, /\bunlock\b/i, /iDEAL/];
    for (const f of textFiles.filter((x) => !x.endsWith('listings.json'))) {
      // alerts.whatsapp=false is a stored setting that switches the old channel off, not copy.
      const src = fs.readFileSync(f, 'utf8').replace(/whatsapp:false|\.whatsapp=false/g, '');
      for (const re of bad) assert.equal(re.test(src), false, `${re} in ${path.relative(dist, f)}`);
    }
  });

  it('wires Abonnement opzeggen from the account page in two clicks', () => {
    const account = read('account.js');
    assert.match(account, /class="ww-cancel-link"><a href="\/opzeggen\/"/);
  });
});

describe('withdrawal and cancellation endpoints (no login)', () => {
  const portal = require('../api/billing-portal.js');
  const legal = require('../lib/ww-legal-requests.cjs');
  const gate = require('../lib/ww-gate.cjs');
  const mail = require('../lib/ww-bellen-mail.cjs');
  let resendCalls;
  let prevKey;

  beforeEach(() => {
    legal.resetRateLimit();
    resendCalls = [];
    prevKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    delete process.env.MOLLIE_API_KEY;
    mail.setResendRequestForTests(async (method, host, p, opts) => {
      resendCalls.push(JSON.parse(opts.body));
      return { id: 'email_mock' };
    });
  });
  afterEach(() => {
    mail.setResendRequestForTests(null);
    gate.setMollieRequestForTests(null);
    if (prevKey == null) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
    delete process.env.MOLLIE_API_KEY;
    delete process.env.WW_LEGAL_INBOX;
  });

  const post = (action, body, headers = {}) => {
    const res = mockRes();
    return portal({ method: 'POST', url: '/api/billing-portal?action=' + action, query: { action }, headers: { 'x-forwarded-for': '203.0.113.9', ...headers }, body }, res).then(() => res);
  };

  it('accepts a withdrawal without login, stores it and does not claim an email it did not send', async () => {
    const res = await post('withdraw', { name: 'Anna de Vries', email: 'anna@example.com', orderDate: '2026-10-01' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.kind, 'withdraw');
    assert.match(res.body.reference, /^WW-\d{8}-[0-9A-F]{6}$/);
    assert.equal(res.body.emailed, false, 'no Resend key → emailed false');
    assert.equal(res.body.stored, true);
    const lines = fs.readFileSync(process.env.WW_LEGAL_LOG_FILE, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const rec = lines.find((l) => l.reference === res.body.reference);
    assert.equal(rec.type, 'withdrawal');
    assert.equal(rec.email, 'anna@example.com');
    assert.equal(rec.orderDate, '2026-10-01');
    assert.equal(resendCalls.length, 0);
  });

  it('mails the consumer and the operator inbox when Resend is configured', async () => {
    process.env.RESEND_API_KEY = 're_test_mock';
    process.env.WW_LEGAL_INBOX = 'legal@example.com';
    const res = await post('withdraw', { name: 'Anna de Vries', email: 'anna@example.com' });
    assert.equal(res.body.emailed, true);
    assert.equal(resendCalls.length, 2);
    assert.equal(resendCalls[0].to[0], 'anna@example.com');
    assert.match(resendCalls[0].text, /ontbinding \(herroeping\)/);
    assert.match(resendCalls[0].text, new RegExp(res.body.reference));
    assert.match(resendCalls[0].text, /42108778/);
    assert.equal(resendCalls[1].to[0], 'legal@example.com');
  });

  it('rejects invalid input and rate-limits floods', async () => {
    const bad = await post('withdraw', { name: '', email: 'not-an-email' });
    assert.equal(bad.statusCode, 400);
    assert.deepEqual(bad.body.fields, ['name', 'email']);
    const future = await post('withdraw', { name: 'Anna', email: 'a@example.com', orderDate: '2099-01-01' });
    assert.equal(future.statusCode, 400);
    legal.resetRateLimit();
    let last;
    for (let i = 0; i < 6; i++) last = await post('withdraw', { name: 'Anna', email: 'a@example.com' });
    assert.equal(last.statusCode, 429);
  });

  it('refuses GET for request actions', async () => {
    const res = mockRes();
    await portal({ method: 'GET', url: '/api/billing-portal?action=withdraw', query: { action: 'withdraw' }, headers: {} }, res);
    assert.equal(res.statusCode, 405);
  });

  it('stores a cancellation request without login and confirms it honestly', async () => {
    const res = await post('cancel', { name: 'Anna', email: 'anna@example.com' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.mode, 'request_stored');
    assert.equal(res.body.accessUntil, null);
  });

  it('cancels a live subscription for a subscriber and keeps access until the paid period ends', async () => {
    process.env.MOLLIE_API_KEY = 'test_mock_compliance';
    process.env.RESEND_API_KEY = 're_test_mock';
    const calls = [];
    gate.setMollieRequestForTests(async (method, apiPath) => {
      calls.push(method + ' ' + apiPath);
      if (method === 'GET' && /\/subscriptions\?/.test(apiPath)) return { _embedded: { subscriptions: [{ id: 'sub_c', status: 'active' }] } };
      if (method === 'DELETE') return { id: 'sub_c', status: 'canceled' };
      if (method === 'GET' && apiPath === '/customers/cst_c') return { id: 'cst_c', email: 'sub@example.com' };
      throw new Error('unexpected ' + method + ' ' + apiPath);
    });
    const exp = Date.now() + 10 * 24 * 3600 * 1000;
    const token = gate.signEntitlement({ plan: 'bellen', source: 'mollie', customerId: 'cst_c', exp });
    const res = await post('cancel', { name: 'Sub', email: 'typed@example.com' }, { cookie: 'ww_bellen=' + encodeURIComponent(token) });
    assert.equal(res.body.mode, 'cancelled');
    assert.equal(res.body.accessUntil, new Date(exp).toISOString());
    assert.equal('set-cookie' in res.headers, false, 'access is not cut off');
    assert.ok(calls.includes('DELETE /customers/cst_c/subscriptions/sub_c'));
    assert.equal(resendCalls[0].to[0], 'sub@example.com');
    assert.match(resendCalls[0].text, /opgezegd/);
    assert.match(resendCalls[0].text, /toegang tot en met/);
  });

  it('falls back to a stored request when the provider call fails', async () => {
    process.env.MOLLIE_API_KEY = 'test_mock_compliance';
    gate.setMollieRequestForTests(async () => { throw new Error('provider down'); });
    const token = gate.signEntitlement({ plan: 'bellen', source: 'mollie', customerId: 'cst_d', exp: Date.now() + 3600_000 });
    const res = await post('cancel', { name: 'Sub', email: 'sub@example.com' }, { cookie: 'ww_bellen=' + encodeURIComponent(token) });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.mode, 'request_stored');
  });

  it('answers a no-JavaScript form post with a readable HTML confirmation', async () => {
    const res = await post('withdraw', 'name=Anna&email=anna%40example.com', { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.raw, /verzoek tot ontbinding ontvangen/);
  });
});

describe('entitlement and checkout responses', () => {
  it('reports checkout closed without naming a provider', async () => {
    process.env.MOLLIE_API_KEY = 'test_mock_compliance';
    delete process.env.WW_CHECKOUT_PROVIDER;
    const entitlement = require('../api/entitlement.js');
    const res = mockRes();
    await entitlement({ method: 'GET', headers: { host: 'localhost' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.checkoutAvailable, false);
    assert.equal(/mollie/i.test(res.raw), false);
    delete process.env.MOLLIE_API_KEY;
  });
});

describe('subscription e-mails', () => {
  const mail = require('../lib/ww-bellen-mail.cjs');
  let calls;
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test_mock';
    calls = [];
    mail.setResendRequestForTests(async (m, h, p, opts) => { calls.push(JSON.parse(opts.body)); return { id: 'x' }; });
  });
  afterEach(() => { mail.setResendRequestForTests(null); delete process.env.RESEND_API_KEY; });

  it('trial start states the first charge date, price, frequency, cancel link and withdrawal', async () => {
    await mail.sendBellenActiveEmail({ email: 'a@example.com', trial: true, firstChargeDate: '2026-10-09' });
    const t = calls[0].text;
    assert.match(t, /1 dag proef/);
    assert.match(t, /9 oktober 2026/);
    assert.match(t, /totaalprijs €18,50 per maand/);
    assert.match(t, /elke maand/);
    assert.match(t, /https:\/\/www\.woonwekker\.nl\/opzeggen\//);
    assert.match(t, /14 dagen herroepingsrecht/);
    assert.equal(/incl\.?\s*btw|1-klik/i.test(t), false);
  });

  it('receipt is a payment confirmation, not an invoice', async () => {
    await mail.sendBellenReceiptEmail({ email: 'a@example.com', amount: '18.50', paidAt: '2026-10-09T08:00:00Z', paymentId: 'tr_1' });
    const t = calls[0].text;
    assert.match(t, /€18,50/);
    assert.match(t, /geen factuur/);
    assert.match(t, /tr_1/);
  });

  it('cancellation confirmation states the access end date', async () => {
    await mail.sendBellenCanceledEmail({ email: 'a@example.com', cancelledAt: '2026-10-08T10:00:00Z', accessUntil: '2026-11-08T22:59:59Z' });
    assert.match(calls[0].text, /opgezegd op 8 oktober 2026/);
    assert.match(calls[0].text, /toegang tot en met 8 november 2026/);
  });

  it('webhook mails a receipt for a paid recurring charge, once per payment', async () => {
    process.env.MOLLIE_API_KEY = 'test_mock_compliance';
    const gate = require('../lib/ww-gate.cjs');
    gate.setMollieRequestForTests(async (method, apiPath) => {
      if (apiPath === '/payments/tr_rec') return { id: 'tr_rec', status: 'paid', sequenceType: 'recurring', customerId: 'cst_r', amount: { value: '18.50', currency: 'EUR' }, paidAt: '2026-10-09T08:00:00Z', metadata: {} };
      if (apiPath === '/customers/cst_r') return { id: 'cst_r', email: 'r@example.com' };
      if (/\/subscriptions/.test(apiPath)) return { _embedded: { subscriptions: [{ id: 'sub_r', status: 'active', nextPaymentDate: '2026-11-09' }] } };
      throw new Error('unexpected ' + method + ' ' + apiPath);
    });
    const webhook = require('../api/mollie/webhook.js');
    for (let i = 0; i < 2; i++) {
      const res = mockRes();
      await webhook({ method: 'POST', url: '/api/mollie/webhook', headers: {}, body: { id: 'tr_rec' } }, res);
      assert.equal(res.statusCode, 200);
    }
    const receipts = calls.filter((c) => /betaling ontvangen/.test(c.subject));
    assert.equal(receipts.length, 1);
    gate.setMollieRequestForTests(null);
    delete process.env.MOLLIE_API_KEY;
  });
});
