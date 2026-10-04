'use strict';

const { citySlug, cityName } = require('./ww-city.cjs');

/** Dutch names required on the public pages. PDOK spells Friesland as Fryslân. */
const PROVINCES = [
  'Drenthe',
  'Flevoland',
  'Friesland',
  'Gelderland',
  'Groningen',
  'Limburg',
  'Noord-Brabant',
  'Noord-Holland',
  'Overijssel',
  'Utrecht',
  'Zeeland',
  'Zuid-Holland',
];

/**
 * City string -> province.
 * Verified 2026-10-04 against PDOK Locatieserver search v3_1 (type:postcode)
 * for every PC4 on the listings, plus woonplaats lookup for ambiguous names.
 * Den Haag postcodes resolve to woonplaats 's-Gravenhage, Zuid-Holland.
 * Noordwijk listing postcode 2202JN is Noordwijk, Zuid-Holland (not the Groningen place).
 * Rijswijk (ZH) postcodes 2284 are Rijswijk, Zuid-Holland.
 * A city is absent here when it was not verified. Do not add a city by guessing.
 */
const CITY_PROVINCE = {
  "Aalsmeer": "Noord-Holland",
  "Aalsmeerderbrug": "Noord-Holland",
  "Abcoude": "Utrecht",
  "Alkmaar": "Noord-Holland",
  "Almere": "Flevoland",
  "Alphen aan den Rijn": "Zuid-Holland",
  "Amersfoort": "Utrecht",
  "Amstelveen": "Noord-Holland",
  "Amsterdam": "Noord-Holland",
  "Apeldoorn": "Gelderland",
  "Arnhem": "Gelderland",
  "Barendrecht": "Zuid-Holland",
  "Barneveld": "Gelderland",
  "Bentveld": "Noord-Holland",
  "Berkel-Enschot": "Noord-Brabant",
  "Breda": "Noord-Brabant",
  "Bussum": "Noord-Holland",
  "Capelle aan den IJssel": "Zuid-Holland",
  "De Zilk": "Zuid-Holland",
  "Delft": "Zuid-Holland",
  "Den Haag": "Zuid-Holland",
  "Den Helder": "Noord-Holland",
  "Denekamp": "Overijssel",
  "Deventer": "Overijssel",
  "Diemen": "Noord-Holland",
  "Dordrecht": "Zuid-Holland",
  "Driebergen-Rijsenburg": "Utrecht",
  "Duivendrecht": "Noord-Holland",
  "Eindhoven": "Noord-Brabant",
  "Elst": "Gelderland",
  "Enschede": "Overijssel",
  "Erica": "Drenthe",
  "Geldrop": "Noord-Brabant",
  "Groningen": "Groningen",
  "Haarlem": "Noord-Holland",
  "Halfweg": "Noord-Holland",
  "Helmond": "Noord-Brabant",
  "Hillegom": "Zuid-Holland",
  "Hilversum": "Noord-Holland",
  "Hoofddorp": "Noord-Holland",
  "Hoogvliet Rotterdam": "Zuid-Holland",
  "Houten": "Utrecht",
  "Hulst": "Zeeland",
  "Julianadorp": "Noord-Holland",
  "Leerdam": "Utrecht",
  "Leeuwarden": "Friesland",
  "Leiden": "Zuid-Holland",
  "Leiderdorp": "Zuid-Holland",
  "Leimuiden": "Zuid-Holland",
  "Lelystad": "Flevoland",
  "Lent": "Gelderland",
  "Lijnden": "Noord-Holland",
  "Maarssen": "Utrecht",
  "Maastricht": "Limburg",
  "Muiden": "Noord-Holland",
  "Naaldwijk": "Zuid-Holland",
  "Nieuw-Vennep": "Noord-Holland",
  "Nieuwegein": "Utrecht",
  "Nijmegen": "Gelderland",
  "Noordwijk": "Zuid-Holland",
  "Nuenen": "Noord-Brabant",
  "Oirschot": "Noord-Brabant",
  "Oudewater": "Utrecht",
  "Overasselt": "Gelderland",
  "Pernis Rotterdam": "Zuid-Holland",
  "Rijswijk (ZH)": "Zuid-Holland",
  "Rotterdam": "Zuid-Holland",
  "Schiedam": "Zuid-Holland",
  "Schipluiden": "Zuid-Holland",
  "Sneek": "Friesland",
  "Soest": "Utrecht",
  "Soesterberg": "Utrecht",
  "Spaarndam": "Noord-Holland",
  "Spijkenisse": "Zuid-Holland",
  "Steyl": "Limburg",
  "Tilburg": "Noord-Brabant",
  "Utrecht": "Utrecht",
  "Velsen-Noord": "Noord-Holland",
  "Venlo": "Limburg",
  "Vianen": "Utrecht",
  "Vlijmen": "Noord-Brabant",
  "Volendam": "Noord-Holland",
  "Voorburg": "Zuid-Holland",
  "Waalwijk": "Noord-Brabant",
  "Wassenaar": "Zuid-Holland",
  "Weesp": "Noord-Holland",
  "Weurt": "Gelderland",
  "Zaandam": "Noord-Holland",
  "Zeist": "Utrecht",
  "Zetten": "Gelderland",
  "Zoetermeer": "Zuid-Holland",
  "Zuiddorpe": "Zeeland",
  "Zwanenburg": "Noord-Holland",
  "Zwolle": "Overijssel",
};

const PROVINCE_SET = new Set(PROVINCES);
for (const [city, province] of Object.entries(CITY_PROVINCE)) {
  if (!PROVINCE_SET.has(province)) throw new Error('bad province for ' + city + ': ' + province);
}

function provinceSlug(name) {
  return citySlug(name);
}

function provinceForCity(city) {
  const key = String(city || '').trim();
  if (!key) return '';
  return CITY_PROVINCE[key] || '';
}

function groupListingsByProvince(rows) {
  const missingCity = [];
  const unmapped = new Map();
  const buckets = new Map(PROVINCES.map((name) => [name, []]));
  for (const row of rows || []) {
    const city = cityName(row);
    if (!city) {
      missingCity.push(row);
      continue;
    }
    const province = provinceForCity(city);
    if (!province) {
      unmapped.set(city, (unmapped.get(city) || 0) + 1);
      continue;
    }
    buckets.get(province).push(row);
  }
  const provinces = [];
  for (const name of PROVINCES) {
    const listings = buckets.get(name);
    if (!listings.length) continue;
    listings.sort((a, b) => {
      const ca = cityName(a);
      const cb = cityName(b);
      if (ca !== cb) return ca < cb ? -1 : 1;
      const aa = String(a.address || '');
      const bb = String(b.address || '');
      if (aa !== bb) return aa < bb ? -1 : 1;
      const pa = String(a.postalCode || '');
      const pb = String(b.postalCode || '');
      if (pa !== pb) return pa < pb ? -1 : 1;
      return String(a.price || '') < String(b.price || '') ? -1 : 1;
    });
    const citiesIn = [];
    const seen = new Set();
    for (const row of listings) {
      const city = cityName(row);
      if (seen.has(city)) continue;
      seen.add(city);
      citiesIn.push({ city, slug: citySlug(city) });
    }
    provinces.push({
      province: name,
      slug: provinceSlug(name),
      listings,
      cities: citiesIn,
    });
  }
  const unmappedCities = [...unmapped.entries()]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => (a.city < b.city ? -1 : 1));
  return { provinces, missingCity: missingCity.length, unmappedCities };
}

module.exports = {
  PROVINCES,
  CITY_PROVINCE,
  provinceSlug,
  provinceForCity,
  groupListingsByProvince,
};
