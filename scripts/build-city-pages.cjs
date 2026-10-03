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

function walkHtml(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (name === 'stad') continue;
      walkHtml(full, acc);
    } else if (name.endsWith('.html')) acc.push(full);
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

function writeSitemap(cities) {
  const staticLocs = [
    `${ORIGIN}/`,
    `${ORIGIN}/kamers/`,
    `${ORIGIN}/huizen/`,
    `${ORIGIN}/prijzen/`,
    `${ORIGIN}/plaats/`,
    `${ORIGIN}/faq/`,
    `${ORIGIN}/insights/`,
    `${ORIGIN}/insights/kamer-studio-or-house-netherlands/`,
    `${ORIGIN}/insights/dutch-rental-search-without-refreshing/`,
    `${ORIGIN}/insights/free-account-vs-bellen-woonwekker/`,
    `${ORIGIN}/insights/how-many-people-move-to-the-netherlands/`,
    `${ORIGIN}/privacy/`,
    `${ORIGIN}/legal/`,
    `${ORIGIN}/login/`,
    `${ORIGIN}/signup/`,
  ];
  const cityLocs = cities.map((c) => `${ORIGIN}/stad/${c.slug}/`);
  const locs = [...staticLocs, ...cityLocs];
  const body = locs.map((loc) => `  <url><loc>${loc}</loc></url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  fs.writeFileSync(path.join(dist, 'sitemap.xml'), xml);
}

function main() {
  const rows = JSON.parse(fs.readFileSync(path.join(dist, 'listings.json'), 'utf8'));
  const grouped = groupListingsByCity(rows);
  if (grouped.slugClash) {
    console.error('slug clash', grouped.slugClash);
    process.exit(1);
  }
  const shell = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  // Canonical on existing public HTML first, using the pre-city shell.
  for (const file of walkHtml(dist)) {
    const href = ORIGIN + publicPath(file);
    const next = withCanonical(fs.readFileSync(file, 'utf8'), href);
    fs.writeFileSync(file, next);
  }
  const freshShell = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  writeCityPagesFixed(freshShell, grouped.cities);
  writeSitemap(grouped.cities);
  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`;
  fs.writeFileSync(path.join(dist, 'robots.txt'), robots);
  console.log(JSON.stringify({
    cities: grouped.cities.length,
    missingCity: grouped.missingCity,
    listings: rows.length,
  }));
}

function writeCityPagesFixed(shell, cities) {
  const stad = path.join(dist, 'stad');
  fs.rmSync(stad, { recursive: true, force: true });
  fs.mkdirSync(stad, { recursive: true });
  for (const entry of cities) {
    const url = `${ORIGIN}/stad/${entry.slug}/`;
    const title = `Huurwoningen in ${entry.city} | Woonwekker`;
    const description = `Huurwoningen in ${entry.city}. Alleen het aanbod in ${entry.city}.`;
    let html = shell;
    html = html.replace(/<title>.*?<\/title>/, `<title>${esc(title)}</title>`);
    html = html.replace(
      /(<meta name="description" content=")[^"]*(")/,
      `$1${esc(description)}$2`
    );
    // drop homepage canonical so we set the city one
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
