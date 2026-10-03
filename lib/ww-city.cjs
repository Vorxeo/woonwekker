'use strict';

/** Slug from the city string in the data. Not a place-name list. */
function citySlug(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cityName(row) {
  return String(row && row.city != null ? row.city : '').trim();
}

function missingCityCount(rows) {
  let n = 0;
  for (const row of rows || []) {
    if (!cityName(row)) n += 1;
  }
  return n;
}

/**
 * Cities that actually appear, with their listings.
 * A blank city is omitted. No city is added that is not in the rows.
 * Returns { cities: [{city, slug, listings}], missingCity, slugClash }
 */
function groupListingsByCity(rows) {
  const missingCity = missingCityCount(rows);
  const byCity = new Map();
  for (const row of rows || []) {
    const city = cityName(row);
    if (!city) continue;
    if (!byCity.has(city)) byCity.set(city, []);
    byCity.get(city).push(row);
  }
  const cities = [];
  const slugSeen = new Map();
  let slugClash = null;
  for (const [city, listings] of byCity) {
    if (!listings.length) continue;
    const slug = citySlug(city);
    if (!slug) {
      slugClash = { city, slug };
      continue;
    }
    if (slugSeen.has(slug)) {
      slugClash = { city, slug, other: slugSeen.get(slug) };
      continue;
    }
    slugSeen.set(slug, city);
    const sorted = listings.slice().sort((a, b) => {
      const aa = String(a.address || '');
      const bb = String(b.address || '');
      if (aa !== bb) return aa < bb ? -1 : 1;
      const pa = String(a.postalCode || '');
      const pb = String(b.postalCode || '');
      if (pa !== pb) return pa < pb ? -1 : 1;
      return String(a.price || '') < String(b.price || '') ? -1 : 1;
    });
    cities.push({ city, slug, listings: sorted });
  }
  cities.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return { cities, missingCity, slugClash };
}

module.exports = { citySlug, cityName, missingCityCount, groupListingsByCity };
