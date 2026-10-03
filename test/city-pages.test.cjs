'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { citySlug, missingCityCount, groupListingsByCity } = require('../lib/ww-city.cjs');

const dist = path.join(__dirname, '..', 'dist');
const rows = JSON.parse(fs.readFileSync(path.join(dist, 'listings.json'), 'utf8'));
const grouped = groupListingsByCity(rows);

function read(rel) {
  return fs.readFileSync(path.join(dist, rel), 'utf8');
}

describe('city pages', () => {
  it('counts listings left out because city is missing', () => {
    const blank = rows.filter((row) => !String(row.city || '').trim());
    assert.equal(grouped.missingCity, blank.length);
    assert.equal(missingCityCount(rows), blank.length);
    assert.equal(grouped.slugClash, null);
    // Printed for the delivery receipt. Not a guessed total.
    console.log(`missingCity=${grouped.missingCity} cities=${grouped.cities.length} listings=${rows.length}`);
  });

  it('does not invent a city or drop a listing that has one', () => {
    const names = new Set(rows.map((row) => String(row.city || '').trim()).filter(Boolean));
    assert.equal(grouped.cities.length, names.size);
    for (const entry of grouped.cities) {
      assert.equal(names.has(entry.city), true);
      assert.equal(entry.listings.length > 0, true);
      assert.equal(entry.slug, citySlug(entry.city));
      for (const row of entry.listings) assert.equal(String(row.city).trim(), entry.city);
    }
  });

  it('publishes /stad/{slug}/ with only that city, title, description, canonical', () => {
    const dirs = fs.readdirSync(path.join(dist, 'stad')).filter((name) =>
      fs.statSync(path.join(dist, 'stad', name)).isDirectory()
    );
    assert.deepEqual(dirs.slice().sort(), grouped.cities.map((c) => c.slug).slice().sort());
    const sitemap = read('sitemap.xml');
    for (const entry of grouped.cities) {
      const html = read(`stad/${entry.slug}/index.html`);
      const url = `https://www.woonwekker.nl/stad/${entry.slug}/`;
      assert.match(html, new RegExp(`<title>Huurwoningen in ${entry.city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\| Woonwekker</title>`));
      assert.match(html, new RegExp(`name="description" content="[^"]*${entry.city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"]*"`));
      assert.match(html, new RegExp(`rel="canonical" href="${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
      assert.equal(html.includes('hreflang'), false);
      assert.equal(/vorxeo/i.test(html), false);
      assert.match(html, /42108778/);
      assert.match(html, /NL005499683B86/);
      const listed = [...html.matchAll(/data-city="([^"]*)"/g)].map((m) => m[1]);
      assert.deepEqual(listed, entry.listings.map((row) => String(row.city).trim()));
      assert.equal(sitemap.includes(`<loc>${url}</loc>`), true);
    }
  });

  it('keeps a no-price listing on its city page when the city is present', () => {
    const html = read('stad/almere/index.html');
    assert.match(html, /GaragePark Almere-Haven/);
    assert.equal(html.includes('data-city="Amsterdam"'), false);
  });

  it('filters in the client by the city string, not a substring', () => {
    const app = fs.readFileSync(path.join(dist, 'app.js'), 'utf8');
    assert.match(app, /String\(p\.city\|\|''\)\.trim\(\)!==locked/);
    assert.match(app, /function cityLockName\(/);
    assert.match(app, /function renderCity\(/);
  });
});

describe('public seo files', () => {
  it('serves robots, sitemap, privacy, and the immigration article from dist', () => {
    const robots = read('robots.txt');
    assert.match(robots, /Sitemap: https:\/\/www\.woonwekker\.nl\/sitemap\.xml/);
    assert.equal(fs.existsSync(path.join(dist, 'privacy/index.html')), true);
    assert.equal(fs.existsSync(path.join(dist, 'insights/how-many-people-move-to-the-netherlands/index.html')), true);
    const sitemap = read('sitemap.xml');
    assert.match(sitemap, /<loc>https:\/\/www\.woonwekker\.nl\/privacy\/<\/loc>/);
    assert.match(sitemap, /<loc>https:\/\/www\.woonwekker\.nl\/insights\/how-many-people-move-to-the-netherlands\/<\/loc>/);
  });

  it('puts a www canonical on public html and does not add hreflang', () => {
    const files = [];
    (function walk(dir) {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) walk(full);
        else if (name.endsWith('.html')) files.push(full);
      }
    })(dist);
    assert.ok(files.length > 90);
    for (const file of files) {
      const html = fs.readFileSync(file, 'utf8');
      const cans = [...html.matchAll(/rel="canonical" href="([^"]*)"/g)].map((m) => m[1]);
      assert.equal(cans.length, 1, file);
      assert.equal(cans[0].startsWith('https://www.woonwekker.nl'), true, file);
      assert.equal(html.includes('hreflang'), false, file);
      assert.equal(/vorxeo/i.test(html), false, file);
    }
  });
});
