'use strict';
/**
 * Compliance build step (run after build-listings.cjs, before build-city-pages.cjs).
 *
 *  - syncs lib/ww-site-copy.cjs and lib/ww-legal-pages.cjs into dist/content.js
 *    (removes the paywall, /plaats/ and draft-legal keys);
 *  - patches every hand-made dist HTML shell: no /plaats/ link, the service notice,
 *    the static legal footer (KvK, btw, legal links, sources from the data) and
 *    Dutch default text for data-t elements so the page reads without JS;
 *  - writes the static legal pages /voorwaarden/, /privacy/, /terugbetaling/,
 *    /herroeping/ (with the model form and the no-login withdrawal form) and /opzeggen/;
 *  - adds the checkout panel with the two unticked consent boxes to /prijzen/;
 *  - deletes dist/plaats and dist/legal (served as 410 / redirect by vercel.json).
 *
 * Idempotent: running it twice gives the same output.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { CLIENT, REMOVE_KEYS, LANGS } = require('../lib/ww-site-copy.cjs');
const { LEGAL } = require('../lib/ww-legal-pages.cjs');
const { MAX_AGE_DAYS } = require('../lib/ww-listing-filter.cjs');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const KVK = '42108778';
const BTW = 'NL005499683B86';
const LEGAL_PAGES = ['voorwaarden', 'privacy', 'terugbetaling', 'herroeping', 'opzeggen'];

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// The original privacy/FAQ sections that the new copy reuses (Account, device storage,
// code, Google Ads, rights; costs, languages, suspicious ads). Captured from content.js on
// the first run and kept here so later runs stay idempotent.
const BASES = path.join(root, 'lib', 'ww-content-bases.json');

function readCopy() {
  const src = fs.readFileSync(path.join(dist, 'content.js'), 'utf8');
  const sandbox = {};
  vm.runInNewContext(src + '\nthis.copy=copy;', sandbox);
  const copy = JSON.parse(JSON.stringify(sandbox.copy));
  const rebuilt = 'const copy=' + JSON.stringify(sandbox.copy, null, 2) + ';\n';
  if (rebuilt.trim() !== src.trim()) throw new Error('content.js is not a plain JSON copy object; refusing to rewrite it');
  const bases = fs.existsSync(BASES) ? JSON.parse(fs.readFileSync(BASES, 'utf8')) : {};
  for (const lang of LANGS) {
    if (!bases[lang]) continue;
    copy[lang]._privacyBase = bases[lang].privacy;
    copy[lang]._faqBase = bases[lang].faq;
  }
  return copy;
}

function writeCopy(copy) {
  const bases = {};
  for (const lang of LANGS) {
    bases[lang] = { privacy: copy[lang]._privacyBase, faq: copy[lang]._faqBase };
    delete copy[lang]._privacyBase;
    delete copy[lang]._faqBase;
  }
  fs.writeFileSync(BASES, JSON.stringify(bases, null, 2) + '\n');
  fs.writeFileSync(path.join(dist, 'content.js'), 'const copy=' + JSON.stringify(copy, null, 2) + ';\n');
}

function sourcesFromData() {
  const rows = JSON.parse(fs.readFileSync(path.join(dist, 'listings.json'), 'utf8'));
  const names = [...new Set(rows.map((r) => String(r.sourceName || '').trim()).filter(Boolean))].sort();
  if (!names.length) throw new Error('no sources in dist/listings.json');
  return names;
}

function fill(value, vars) {
  if (typeof value === 'string') return value.replace(/\{(sources|days)\}/g, (m, k) => vars[k]);
  if (Array.isArray(value)) return value.map((v) => fill(v, vars));
  return value;
}

/** Remove the sentence that contains `needle` from an HTML paragraph. */
function dropSentenceWith(part, needle) {
  const at = part.indexOf(needle);
  if (at < 0) return part;
  const before = part.slice(0, at);
  let start = -1;
  const re = /[.!?]\s/g;
  let m;
  while ((m = re.exec(before))) start = m.index + 1;
  const open = before.lastIndexOf('<p>');
  if (start < open) start = open + 3; // the sentence is the first in its paragraph
  const after = part.slice(at);
  const endRel = after.search(/[.!?](?=\s|<\/p>)/);
  const end = endRel < 0 ? part.length : at + endRel + 1;
  return (part.slice(0, start) + part.slice(end)).replace(/<p>\s+/, '<p>').replace(/\s+<\/p>/, '</p>');
}

function splitParts(html) {
  return String(html).split(/(?=<p>|<ol>|<ul>|<h2>|<!-- ww-expand -->)/);
}

// Sentences claiming the lowest/best prices are unverifiable: drop them.
const PRICE_SUPERLATIVE = /[^.!?]*(lowest prices|precios más bajos|najniższe ceny|preços mais baixos|cele mai mici prețuri|най-ниските цени|prezzi più bassi|laagste prijzen|beste prijzen)[^.!?]*[.!?]\s*/gi;

function patchInsights(entry) {
  for (const k of ['housesIntro', 'roomsIntro', 'intro']) {
    if (typeof entry[k] === 'string') entry[k] = entry[k].replace(PRICE_SUPERLATIVE, '').trim();
  }
  // "/signup/ is a free account; it is not the paid unlock" implied paid contact access.
  entry.insightsA1Body = String(entry.insightsA1Body).replace(/(<a href="\/signup\/">\/signup\/<\/a>[^;<]*);[^<]*(<\/li>)/, '$1.$2');
  const a1 = splitParts(entry.insightsA1Body);
  if (a1.length === 14) {
    a1[4] = dropSentenceWith(a1[4], '<a href="/plaats/">');
    a1[7] = dropSentenceWith(a1[7], '<a href="/prijzen/">');
    a1.splice(13, 1);
    entry.insightsA1Body = a1.join('');
  }
  const a2 = splitParts(entry.insightsA2Body);
  if (a2.length === 13) {
    a2[3] = dropSentenceWith(a2[3], '<a href="/plaats/">');
    a2.splice(7, 1);
    a2.splice(5, 1);
    entry.insightsA2Body = a2.join('');
  }
}

function resolvePrivacy(lang, oldSections) {
  return LEGAL[lang].privacy.sections.map((s) => {
    if (typeof s !== 'string') return s;
    const idx = Number(s.split(':')[1]);
    const kept = oldSections[idx];
    if (!kept) throw new Error(`privacy KEEP:${idx} missing for ${lang}`);
    return kept;
  });
}

function syncCopy(copy, sources) {
  const vars = { sources: sources.join(', '), days: String(MAX_AGE_DAYS) };
  for (const lang of LANGS) {
    const entry = copy[lang];
    if (!entry) throw new Error('content.js missing ' + lang);
    const legal = LEGAL[lang];
    for (const [k, v] of Object.entries(CLIENT[lang])) entry[k] = fill(v, vars);
    for (const k of REMOVE_KEYS) delete entry[k];
    for (const k of Object.keys(entry)) if (/^plaats/.test(k)) delete entry[k];
    // Privacy: keep the original-source sections once (first run) under a stable key order.
    const old = entry.privacySections;
    if (!entry._privacyBase) {
      entry._privacyBase = [1, 2, 5, 6, 8].reduce((acc, i) => { acc[i] = old[i]; return acc; }, {});
      // Section order differs per language: slot 6 is always the Google Ads consent section.
      entry._privacyBase[6] = old.find((sec) => sec[0] === 'Google Ads');
    }
    entry.privacySections = resolvePrivacy(lang, entry._privacyBase);
    entry.privacyPageTitle = legal.privacy.title;
    entry.privacyPageIntro = legal.privacy.intro;
    const f = legal.faqNew;
    if (!entry._faqBase) entry._faqBase = { 3: entry.faqItems[3], 5: entry.faqItems[5], 8: entry.faqItems[8] };
    entry.faqItems = fill([f.what, f.sources, f.fresh, f.contact, f.pay, f.alerts, f.cancel, entry._faqBase[3], entry._faqBase[5], f.photos, entry._faqBase[8]], vars);
    entry.insightsA3Title = legal.insightA3.title;
    entry.insightsA3Intro = legal.insightA3.intro;
    entry.insightsA3Body = legal.insightA3.body;
    patchInsights(entry);
  }
  return copy;
}

/* ---------- HTML ---------- */

function walkHtml(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (dir === dist && ['stad', 'provincie', 'plaats', 'legal'].includes(name)) continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walkHtml(full, acc);
    else if (name.endsWith('.html')) acc.push(full);
  }
  return acc;
}

function serviceNoticeHtml(nl) {
  return `<aside class="ww-service-notice" role="note"><p data-t="serviceNotice">${esc(nl.serviceNotice)}</p></aside>`;
}

function footerHtml(nl, provinceLinks, sources) {
  const link = (href, key) => `<a href="${href}" data-t="${key}">${esc(nl[key])}</a>`;
  const heading = (key) => `<h2 class="ww-footer-heading" data-t="${key}">${esc(nl[key])}</h2>`;
  return '<footer>'
    + '<div class="ww-footer-main">'
    + `<div class="ww-footer-brand"><a class="ww-footer-logo" href="/" aria-label="Woonwekker"><img src="/assets/icon-192.png" alt="" width="40" height="40"><strong>Woonwekker</strong></a><p data-t="footer">${esc(nl.footer)}</p><p class="ww-footer-company" data-t="companyIdentity">${esc(nl.companyIdentity)}</p>`
    + `</div>`
    + `<section class="ww-footer-section">${heading('footerExplore')}<div class="ww-footer-links">${link('/huizen/', 'navHouses')}${link('/kamers/', 'navRooms')}${link('/prijzen/', 'pricing')}${link('/account/', 'account')}${link('/faq/', 'faq')}${link('/insights/', 'insights')}</div></section>`
    + `<section class="ww-footer-section">${heading('footerLegal')}<div class="ww-footer-links ww-legal-links">${link('/voorwaarden/', 'footerTerms')}${link('/privacy/', 'privacy')}${link('/terugbetaling/', 'footerRefund')}${link('/herroeping/', 'footerWithdrawalInfo')}${link('/opzeggen/', 'footerCancel')}${link('/herroeping/#ontbinden', 'footerWithdraw')}</div></section>`
    + `<section class="ww-footer-section ww-footer-contact">${heading('footerContact')}<address class="ww-company-contact"><span class="ww-contact-company">Vorxeo</span><span>Keizersgracht 520H<br>1017 EK Amsterdam, Nederland</span><a href="mailto:support@vorxeo.com">support@vorxeo.com</a><a href="tel:+31852127769">+31 85 212 77 69</a></address></section></div>`
    + `<section class="ww-footer-provinces">${heading('footerProvinces')}${provinceLinks || '<div class="province-links"></div>'}</section>`
    + `<small class="ww-legal-id"><span>© 2026 Vorxeo (Woonwekker)</span><span><span data-t="kvkLabel">${esc(nl.kvkLabel)}</span> ${KVK}</span><span><span data-t="btwLabel">${esc(nl.btwLabel)}</span> ${BTW}</span></small>`
    + '</footer>';
}

function fillDataT(html, nl) {
  return html.replace(/(<(a|span|p|h1|h2|h3|button|label|strong|dt|dd|small)\b[^>]*\bdata-t="([A-Za-z0-9_]+)"[^>]*>)([^<]*)(<\/\2>)/g, (full, open, tag, key, text, close) => {
    const v = nl[key];
    return typeof v === 'string' ? open + esc(v) + close : full;
  });
}

function patchShell(html, nl, sources) {
  let out = html.replace(/<a href="\/plaats\/" data-t="listHome"><\/a>/g, '').replace(/<a href="\/plaats\/"[^>]*>[^<]*<\/a>/g, '');
  out = out.replace(/<aside class="ww-service-notice"[\s\S]*?<\/aside>/g, '');
  if (!out.includes('</header>')) throw new Error('header missing');
  out = out.replace('</header>', '</header>' + serviceNoticeHtml(nl));
  const fm = out.match(/<footer>[\s\S]*?<\/footer>/);
  if (!fm) throw new Error('footer missing');
  const prov = (fm[0].match(/<div class="province-links">[\s\S]*?<\/div>/) || [''])[0];
  out = out.replace(fm[0], footerHtml(nl, prov, sources));
  return fillDataT(out, nl);
}

function langBlocks(render) {
  return LANGS.map((lang) => `<div data-ww-lang="${lang}" lang="${lang}"${lang === 'nl' ? '' : ' hidden'}>${render(LEGAL[lang], lang)}</div>`).join('');
}

function sectionsHtml(sections) {
  return sections.map(([title, ...paras]) => `<section><h2>${esc(title)}</h2>${paras.map((p) => `<p>${esc(p)}</p>`).join('')}</section>`).join('');
}

function head(l, page, eyebrow) {
  return `<div class="page-head"><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(l[page].title)}</h1><p class="ww-legal-version">${esc(l.version)}</p></div>`;
}

function requestForm(kind, nl) {
  const id = kind === 'withdraw' ? 'wd' : 'cn';
  const action = kind === 'withdraw' ? '/api/withdrawal' : '/api/cancel';
  const submitKey = kind === 'withdraw' ? 'withdrawSubmit' : 'cancelSubmit';
  return `<form class="ww-legal-request" id="ww-${kind}-form" data-ww-request="${kind}" action="${action}" method="post">`
    + `<div class="ww-field"><label for="${id}-name" data-t="formName">${esc(nl.formName)}</label><input id="${id}-name" name="name" required maxlength="120" autocomplete="name"></div>`
    + `<div class="ww-field"><label for="${id}-email" data-t="formEmail">${esc(nl.formEmail)}</label><input id="${id}-email" name="email" type="email" required maxlength="200" autocomplete="email"></div>`
    + (kind === 'withdraw' ? `<div class="ww-field"><label for="${id}-date" data-t="formOrderDate">${esc(nl.formOrderDate)}</label><input id="${id}-date" name="orderDate" type="date"></div>` : '')
    + `<button type="submit" class="primary" data-t="${submitKey}">${esc(nl[submitKey])}</button>`
    + `<div class="ww-request-result" role="status" aria-live="polite"></div>`
    + '</form>';
}

function perLangSpans(get) {
  return LANGS.map((lang) => `<span data-ww-lang="${lang}" lang="${lang}"${lang === 'nl' ? '' : ' hidden'}>${esc(get(LEGAL[lang], lang))}</span>`).join('');
}

function pageMain(page, copy) {
  const nl = copy.nl;
  let body = '';
  if (page === 'voorwaarden' || page === 'terugbetaling') {
    body = langBlocks((l) => head(l, page, 'Woonwekker') + `<div class="prose">${sectionsHtml(l[page].sections)}</div>`);
  } else if (page === 'privacy') {
    body = langBlocks((l, lang) => head(l, page, copy[lang].privacy || 'Privacy') + `<div class="prose"><p>${esc(l.privacy.intro)}</p>${sectionsHtml(copy[lang].privacySections)}</div>`);
  } else if (page === 'herroeping') {
    body = langBlocks((l) => {
      const h = l.herroeping;
      const model = `<section class="ww-model-form"><h2>${esc(h.modelTitle)}</h2><p><em>${esc(h.modelNote)}</em></p><ul>${h.modelLines.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p><small>${esc(h.modelFoot)}</small></p></section>`;
      return head(l, page, 'Woonwekker') + `<div class="prose">${sectionsHtml(h.sections)}${model}</div>`;
    }) + `<section class="ww-legal-form prose" id="ontbinden"><h2 data-t="footerWithdraw">${esc(nl.footerWithdraw)}</h2><p>${perLangSpans((l) => l.herroeping.formIntro)}</p>${requestForm('withdraw', nl)}</section>`;
  } else if (page === 'opzeggen') {
    body = langBlocks((l) => head(l, page, 'Woonwekker') + `<div class="prose">${l.opzeggen.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}</div>`)
      + `<section class="ww-legal-form prose" id="opzeggen-form">${requestForm('cancel', nl)}<p>${perLangSpans((l) => l.opzeggen.withdrawHint)} <a href="/herroeping/#ontbinden" data-t="footerWithdraw">${esc(nl.footerWithdraw)}</a>.</p></section>`;
  }
  return `<main id="main" data-ww-static="${page}">${body}</main>`;
}

function writeLegalPage(shell, page, copy) {
  const l = LEGAL.nl[page];
  let html = shell;
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(l.title)} | Woonwekker</title>`);
  html = html.replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(l.meta)}$2`);
  html = html.replace(/<link\s+rel="canonical"[^>]*>/g, '').replace('</title>', `</title><link rel="canonical" href="https://www.woonwekker.nl/${page}/">`);
  html = html.replace(/<main id="main"[^>]*>[\s\S]*?<\/main>/, pageMain(page, copy));
  html = html.replace(/<section class="ww-checkout"[\s\S]*?<\/section><!-- \/ww-checkout -->/g, '');
  const dir = path.join(dist, page);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}

function checkoutPanel(nl) {
  const row = (k) => `<dt data-t="checkout${k}Label">${esc(nl['checkout' + k + 'Label'])}</dt><dd data-t="checkout${k}Value">${esc(nl['checkout' + k + 'Value'])}</dd>`;
  return `<section class="ww-checkout" id="checkout" aria-labelledby="checkout-title">`
    + `<h2 id="checkout-title" data-t="checkoutTitle">${esc(nl.checkoutTitle)}</h2>`
    + `<p class="notice" id="checkout-unavailable" data-t="checkoutUnavailable">${esc(nl.checkoutUnavailable)}</p>`
    + `<dl class="ww-checkout-terms">${row('Trial')}${row('Price')}${row('Renew')}${row('Cancel')}</dl>`
    + `<form id="ww-checkout-form" novalidate>`
    + `<label class="ww-consent"><input type="checkbox" id="consent-terms" name="consentTerms" required> <span data-t="consentTermsA">${esc(nl.consentTermsA)}</span> <a href="/voorwaarden/" target="_blank" data-t="consentTermsLink">${esc(nl.consentTermsLink)}</a> <span data-t="consentTermsB">${esc(nl.consentTermsB)}</span></label>`
    + `<label class="ww-consent"><input type="checkbox" id="consent-immediate" name="consentImmediateStart" required> <span data-t="consentImmediate">${esc(nl.consentImmediate)}</span></label>`
    + `<button type="submit" class="primary" id="checkout-submit" disabled data-t="checkoutSubmit">${esc(nl.checkoutSubmit)}</button>`
    + `<p class="ww-status" id="checkout-msg" role="status" aria-live="polite"></p>`
    + `</form></section><!-- /ww-checkout -->`;
}

function main() {
  const sources = sourcesFromData();
  const copy = syncCopy(readCopy(), sources);
  // Internal helper keys must not ship.
  const forShip = JSON.parse(JSON.stringify(copy));
  for (const lang of LANGS) { delete forShip[lang]._privacyBase; delete forShip[lang]._faqBase; }
  const nl = forShip.nl;

  for (const dir of ['plaats', 'legal']) fs.rmSync(path.join(dist, dir), { recursive: true, force: true });

  for (const file of walkHtml(dist)) {
    let html = patchShell(fs.readFileSync(file, 'utf8'), nl, sources);
    if (path.relative(dist, file) === path.join('prijzen', 'index.html')) {
      html = html.replace(/<section class="ww-checkout"[\s\S]*?<\/section><!-- \/ww-checkout -->/g, '');
      html = html.replace('</main>', '</main>' + checkoutPanel(nl));
    }
    fs.writeFileSync(file, html);
  }

  const shell = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  if (!/<main id="main"><\/main>/.test(shell)) throw new Error('index.html main is not empty');
  for (const page of LEGAL_PAGES) writeLegalPage(shell, page, forShip);

  writeCopy(copy);
  const report = { sources, pages: LEGAL_PAGES, shells: walkHtml(dist).length };
  console.log(JSON.stringify(report));
}

main();
