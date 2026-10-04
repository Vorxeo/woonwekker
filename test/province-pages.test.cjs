'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PROVINCES, provinceForCity, groupListingsByProvince } = require('../lib/ww-province.cjs');
const { cityName } = require('../lib/ww-city.cjs');

const dist = path.join(__dirname, '..', 'dist');
const rows = JSON.parse(fs.readFileSync(path.join(dist, 'listings.json'), 'utf8'));
const grouped = groupListingsByProvince(rows);

function read(rel) {
  return fs.readFileSync(path.join(dist, rel), 'utf8');
}

function jsonLd(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 1);
  return JSON.parse(blocks[0][1]);
}

describe('province mapping', () => {
  it('keeps a listing off every province unless its city maps to that province', () => {
    assert.equal(grouped.missingCity, rows.filter((row) => !cityName(row)).length);
    assert.deepEqual(grouped.unmappedCities, []);
    const seen = new Map();
    for (const entry of grouped.provinces) {
      assert.equal(PROVINCES.includes(entry.province), true);
      assert.equal(entry.listings.length > 0, true);
      for (const row of entry.listings) {
        const city = cityName(row);
        assert.equal(provinceForCity(city), entry.province);
        assert.equal(seen.has(row), false);
        seen.set(row, entry.province);
      }
    }
    for (const row of rows) {
      const city = cityName(row);
      if (!city || !provinceForCity(city)) {
        assert.equal(seen.has(row), false);
        continue;
      }
      assert.equal(seen.get(row), provinceForCity(city));
    }
    assert.equal(seen.size, rows.length - grouped.missingCity - grouped.unmappedCities.reduce((n, c) => n + c.count, 0));
  });

  it('does not place a blank city, an unknown city, or Putten by guessing', () => {
    const sample = groupListingsByProvince([
      { city: '', address: 'No city' },
      { city: '   ', address: 'Blank' },
      { city: 'Nergenshuizen', address: 'Unknown' },
      { city: 'Putten', address: 'Not in the verified map', province: 'Gelderland' },
      { city: 'Apeldoorn', address: 'Asselsestraat 1', province: 'Flevoland' },
    ]);
    assert.equal(sample.missingCity, 2);
    assert.deepEqual(sample.unmappedCities.map((c) => c.city), ['Nergenshuizen', 'Putten']);
    assert.equal(sample.provinces.length, 1);
    assert.equal(sample.provinces[0].province, 'Gelderland');
    assert.deepEqual(sample.provinces[0].listings.map((row) => row.address), ['Asselsestraat 1']);
    assert.equal(provinceForCity('Putten'), '');
    assert.equal(provinceForCity(''), '');
  });
});

describe('province pages', () => {
  it('publishes one page per province that has listings and none for an empty province', () => {
    const dir = path.join(dist, 'provincie');
    const slugs = fs.readdirSync(dir).filter((name) => fs.statSync(path.join(dir, name)).isDirectory());
    assert.deepEqual(slugs.slice().sort(), grouped.provinces.map((p) => p.slug).slice().sort());
    assert.equal(fs.existsSync(path.join(dir, 'index.html')), false);
    const sitemap = read('sitemap.xml');
    const locs = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    for (const entry of grouped.provinces) {
      const html = read(`provincie/${entry.slug}/index.html`);
      const url = `https://www.woonwekker.nl/provincie/${entry.slug}/`;
      assert.match(html, new RegExp(`<title>Huis te huur ${entry.province.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')} \\| Woonwekker</title>`));
      assert.match(html, new RegExp(`name="description" content="Huis te huur in ${entry.province.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\. Alleen het aanbod in plaatsen in`));
      assert.equal(/\d+\s+(woningen|huizen|listings|anuncios)/i.test(html.match(/<title>[^<]*<\/title>/)[0]), false);
      assert.match(html, new RegExp(`rel="canonical" href="${url.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}"`));
      assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
      assert.equal(html.includes('hreflang'), false);
      assert.equal(/vorxeo/i.test(html), false);
      assert.match(html, /42108778/);
      assert.match(html, /NL005499683B86/);
      assert.match(html, new RegExp(`name="ww-province" content="${entry.province}"`));
      const listed = [...html.matchAll(/data-city="([^"]*)"/g)].map((m) => m[1]);
      assert.deepEqual(listed, entry.listings.map((row) => cityName(row)));
      for (const city of listed) assert.equal(provinceForCity(city), entry.province);
      assert.equal(sitemap.includes(`<loc>${url}</loc>`), true);
      assert.equal(locs.filter((loc) => loc === url).length, 1);
      const data = jsonLd(html);
      const org = data['@graph'].find((node) => node['@type'] === 'Organization');
      const page = data['@graph'].find((node) => node['@type'] === 'CollectionPage');
      assert.equal(org.name, 'Woonwekker');
      assert.equal(page.url, url);
      assert.equal(page.about.name, entry.province);
      assert.equal(page.mainEntity['@type'], 'ItemList');
      assert.equal(page.mainEntity.numberOfItems, listed.length);
      assert.equal(JSON.stringify(data).includes('aggregateRating'), false);
      assert.equal(JSON.stringify(data).includes('ratingValue'), false);
      assert.equal(/vorxeo/i.test(JSON.stringify(data)), false);
      assert.equal(/pararius|kamernet|funda/i.test(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')), false);
    }
    for (const name of PROVINCES) {
      const entry = grouped.provinces.find((p) => p.province === name);
      const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (!entry) assert.equal(fs.existsSync(path.join(dir, slug, 'index.html')), false);
    }
  });

  it('filters in the client by the province city list and keeps Nieuw badges', () => {
    const app = read('app.js');
    assert.match(app, /function provinceLock\(/);
    assert.match(app, /function provinceHead\(/);
    assert.match(app, /function renderProvince\(/);
    assert.match(app, /province\.cities\.has\(String\(p\.city\|\|''\)\.trim\(\)\)/);
    assert.match(app, /newBadge\(p\)/);
    for (const code of ['nl', 'en', 'es', 'pl', 'pt', 'ro', 'bg', 'it']) {
      assert.match(app, new RegExp(`provinceHead[\\s\\S]*${code}:\``));
    }
    assert.match(app, /Casas para arrendar em/);
    assert.equal(app.includes('Casas para alugar'), false);
    const gelderland = read('provincie/gelderland/index.html');
    const places = JSON.parse(gelderland.match(/id="ww-province-cities">([^<]*)<\/script>/)[1]);
    assert.equal(places.some((p) => p.city === 'Putten'), false);
    assert.equal(places.some((p) => p.city === 'Apeldoorn'), true);
    assert.equal(gelderland.includes('data-city="Amsterdam"'), false);
    assert.match(gelderland, /data-city="Arnhem"/);
  });
});

describe('sitemap lastmod', () => {
  it('dates every public url with the day of this change and keeps one url per page', () => {
    const sitemap = read('sitemap.xml');
    assert.equal(sitemap.includes('hreflang'), false);
    const locs = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    const dates = [...sitemap.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)].map((m) => m[1]);
    assert.equal(dates.length, locs.length);
    assert.ok(dates.every((d) => d === '2026-10-04'));
    for (const slug of ['drenthe','flevoland','friesland','gelderland','groningen','limburg','noord-brabant','noord-holland','overijssel','utrecht','zeeland','zuid-holland']) {
      assert.equal(locs.filter((loc) => loc === `https://www.woonwekker.nl/provincie/${slug}/`).length, 1);
    }
    const html = read('provincie/gelderland/index.html');
    assert.equal(html.includes('lowest prices'), false);
    assert.equal(html.includes('precios más bajos'), false);
    assert.equal(/vorxeo/i.test(html), false);
  });
});

