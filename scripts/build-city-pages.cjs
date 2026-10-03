'use strict';

const fs = require('fs');
const path = require('path');
const { groupListingsByCity } = require('../lib/ww-city.cjs');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const ORIGIN = 'https://www.woonwekker.nl';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function decodeEntities(value) {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function publicPath(file) {
  const rel = path.relative(dist, file).split(path.sep).join('/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return '/' + rel.slice(0, -'index.html'.length);
  return '/' + rel;
}

function withCanonical(html, url) {
  let out = html.replace(/<link\s+rel="canonical"[^>]*>/g, '');
  out = out.replace(/<link\s+[^>]*hreflang=[^>]*>/g, '');
  const tag = `<link rel="canonical" href="${esc(url)}">`;
  if (!out.includes('</title>')) throw new Error('missing title: ' + url);
  return out.replace('</title>', `</title>${tag}`);
}

function walkHtml(dir, acc = [], skipStad = false) {
  for (const name of fs.readdirSync(dir)) {
    if (skipStad && dir === dist && name === 'stad') continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walkHtml(full, acc, skipStad);
    else if (name.endsWith('.html')) acc.push(full);
  }
  return acc;
}

function listingItem(row) {
  const city = String(row.city).trim();
  const address = String(row.address || '').trim();
  const price = String(row.price || '').trim();
  const kind = String(row.propertyType || '').trim();
  const bits = [address || city];
  if (kind) bits.push(kind);
  if (price) bits.push(`€${price}`);
  return `<li data-city="${esc(city)}">${esc(bits.join(' · '))}</li>`;
}

function jsonForScript(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function field(html, re) {
  const match = html.match(re);
  return match ? decodeEntities(match[1]) : '';
}

function listingNames(html) {
  const names = [];
  const re = /<li data-city="[^"]*">([^<]*)<\/li>/g;
  let match;
  while ((match = re.exec(html))) names.push(decodeEntities(match[1]));
  return names;
}

function orgGraph() {
  return [
    {
      '@type': 'Organization',
      '@id': `${ORIGIN}/#organization`,
      name: 'Woonwekker',
      url: `${ORIGIN}/`,
      identifier: [
        { '@type': 'PropertyValue', name: 'KvK', value: '42108778' },
        { '@type': 'PropertyValue', name: 'BTW', value: 'NL005499683B86' },
      ],
    },
    {
      '@type': 'WebSite',
      '@id': `${ORIGIN}/#website`,
      name: 'Woonwekker',
      url: `${ORIGIN}/`,
      publisher: { '@id': `${ORIGIN}/#organization` },
      inLanguage: ['nl', 'en', 'es', 'pl', 'pt', 'ro', 'bg', 'it'],
    },
  ];
}

function graphFor(html) {
  const canonical = field(html, /rel="canonical" href="([^"]*)"/);
  const title = field(html, /<title>([^<]*)<\/title>/);
  const description = field(html, /<meta name="description" content="([^"]*)"/);
  if (!canonical.startsWith(`${ORIGIN}/`)) throw new Error('canonical ' + canonical);
  const page = {
    '@type': 'WebPage',
    '@id': `${canonical}#webpage`,
    url: canonical,
    name: title,
    isPartOf: { '@id': `${ORIGIN}/#website` },
    publisher: { '@id': `${ORIGIN}/#organization` },
    inLanguage: 'nl',
  };
  if (description) page.description = description;
  const names = listingNames(html);
  if (/\/stad\/[^/]+\/$/.test(canonical)) {
    if (!names.length) throw new Error('empty city page ' + canonical);
    page['@type'] = 'CollectionPage';
    const city = field(html, /<h1>([^<]*)<\/h1>/);
    if (!city) throw new Error('city h1 missing ' + canonical);
    page.about = { '@type': 'Place', name: city };
    page.mainEntity = {
      '@type': 'ItemList',
      numberOfItems: names.length,
      itemListElement: names.map((name, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name,
      })),
    };
  }
  return { '@context': 'https://schema.org', '@graph': [...orgGraph(), page] };
}

function upsertJsonLd(html, data) {
  const tag = `<script type="application/ld+json">${jsonForScript(data)}</script>`;
  if (!html.includes('application/ld+json')) {
    if (!html.includes('</head>')) throw new Error('missing head');
    return html.replace('</head>', `${tag}</head>`);
  }
  const next = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, tag);
  if (next === html) throw new Error('json-ld replace failed');
  return next;
}

function stampSchema(file) {
  const html = fs.readFileSync(file, 'utf8');
  const next = upsertJsonLd(html, graphFor(html));
  if (/vorxeo/i.test(next)) throw new Error('Vorxeo in ' + file);
  if (next.includes('hreflang')) throw new Error('hreflang in ' + file);
  fs.writeFileSync(file, next);
}

function writeSitemap() {
  const files = walkHtml(dist);
  const locs = files.map((file) => {
    const html = fs.readFileSync(file, 'utf8');
    const match = html.match(/rel="canonical" href="([^"]*)"/g);
    if (!match || match.length !== 1) throw new Error('canonical count ' + file);
    const href = html.match(/rel="canonical" href="([^"]*)"/)[1];
    const expected = ORIGIN + publicPath(file);
    if (href !== expected) throw new Error(`canonical drift ${href} != ${expected}`);
    return href;
  });
  const unique = [...new Set(locs)];
  if (unique.length !== locs.length) throw new Error('duplicate canonical');
  unique.sort((a, b) => a.localeCompare(b));
  const body = unique.map((loc) => `  <url><loc>${esc(loc)}</loc></url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  fs.writeFileSync(path.join(dist, 'sitemap.xml'), xml);
  return unique.length;
}

function writeRobots() {
  const robots = [
    'User-agent: *',
    'Allow: /',
    'Allow: /stad/',
    'Allow: /privacy/',
    'Allow: /insights/',
    '',
    `Sitemap: ${ORIGIN}/sitemap.xml`,
    '',
  ].join('\n');
  if (/disallow:\s*\/(stad|privacy|insights)/i.test(robots)) {
    throw new Error('robots disallows a public section');
  }
  fs.writeFileSync(path.join(dist, 'robots.txt'), robots);
}

function main() {
  const rows = JSON.parse(fs.readFileSync(path.join(dist, 'listings.json'), 'utf8'));
  const grouped = groupListingsByCity(rows);
  if (grouped.slugClash) {
    console.error('slug clash', grouped.slugClash);
    process.exit(1);
  }
  for (const file of walkHtml(dist, [], true)) {
    const href = ORIGIN + publicPath(file);
    const next = withCanonical(fs.readFileSync(file, 'utf8'), href);
    fs.writeFileSync(file, next);
  }
  const freshShell = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  writeCityPagesFixed(freshShell, grouped.cities);
  for (const file of walkHtml(dist)) stampSchema(file);
  const sitemapUrls = writeSitemap();
  writeRobots();
  console.log(JSON.stringify({
    cities: grouped.cities.length,
    missingCity: grouped.missingCity,
    listings: rows.length,
    sitemapUrls,
    htmlPages: walkHtml(dist).length,
  }));
}

function writeCityPagesFixed(shell, cities) {
  const stad = path.join(dist, 'stad');
  fs.rmSync(stad, { recursive: true, force: true });
  fs.mkdirSync(stad, { recursive: true });
  for (const entry of cities) {
    if (!entry.listings.length) throw new Error('empty city ' + entry.city);
    const url = `${ORIGIN}/stad/${entry.slug}/`;
    const title = `Huurwoningen in ${entry.city} | Woonwekker`;
    const description = `Huurwoningen in ${entry.city}. Alleen het aanbod in ${entry.city}.`;
    let html = shell;
    html = html.replace(/<title>.*?<\/title>/, `<title>${esc(title)}</title>`);
    html = html.replace(
      /(<meta name="description" content=")[^"]*(")/,
      `$1${esc(description)}$2`
    );
    html = html.replace(/<link\s+rel="canonical"[^>]*>/g, '');
    html = html.replace(/<link\s+[^>]*hreflang=[^>]*>/g, '');
    const headBits = `<link rel="canonical" href="${esc(url)}"><meta name="ww-city" content="${esc(entry.city)}">`;
    html = html.replace('</title>', `</title>${headBits}`);
    const items = entry.listings.map(listingItem).join('');
    const main = `<main id="main"><h1>${esc(entry.city)}</h1><ul class="city-listings">${items}</ul></main>`;
    if (!html.includes('<main id="main"></main>')) throw new Error('shell main missing');
    html = html.replace('<main id="main"></main>', main);
    if (html.includes('vorxeo') || html.includes('Vorxeo')) throw new Error('Vorxeo in city page');
    if (html.includes('hreflang')) throw new Error('hreflang in city page');
    const dir = path.join(stad, entry.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html);
  }
}

main();
