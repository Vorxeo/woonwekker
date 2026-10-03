'use strict';
/**
 * Landlord listing intake. Does not publish to the public feed.
 * Fail-closed without RESEND_API_KEY or woonwekker_resend_api_key. Email goes to support for review.
 */
const https = require('https');
const { resendConfigured, resendFrom } = require('./ww-auth.cjs');

const TYPES = new Set(['Appartement', 'Huis', 'Studio', 'Kamer']);
const TO_DEFAULT = 'support@vorxeo.com';

function intakeTo() {
  const t = String(process.env.WW_LISTING_INTAKE_TO || '').trim();
  return t || TO_DEFAULT;
}

function clip(v, n) {
  return String(v == null ? '' : v).trim().slice(0, n);
}

function validateListing(body) {
  const b = body && typeof body === 'object' ? body : {};
  const errors = [];
  const name = clip(b.name, 80);
  const email = clip(b.email, 120).toLowerCase();
  const phone = clip(b.phone, 30);
  const address = clip(b.address, 120);
  const postcode = clip(b.postcode, 12).toUpperCase();
  const city = clip(b.city, 60);
  const type = clip(b.type, 40);
  const desc = clip(b.desc, 2000);
  const photo = clip(b.photo, 500);
  const availableFrom = clip(b.availableFrom, 10);
  const price = Number(b.price);
  const bedsRaw = b.beds === '' || b.beds == null ? null : Number(b.beds);
  const areaRaw = b.area === '' || b.area == null ? null : Number(b.area);

  if (name.length < 2) errors.push('name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('email');
  if (!/^[0-9+().\s-]{8,30}$/.test(phone)) errors.push('phone');
  if (address.length < 4) errors.push('address');
  if (!/^[1-9][0-9]{3}\s?[A-Z]{2}$/.test(postcode)) errors.push('postcode');
  if (city.length < 2) errors.push('city');
  if (!TYPES.has(type)) errors.push('type');
  if (!Number.isFinite(price) || price < 1 || price > 20000) errors.push('price');
  if (bedsRaw != null && (!Number.isFinite(bedsRaw) || bedsRaw < 0 || bedsRaw > 20)) errors.push('beds');
  if (areaRaw != null && (!Number.isFinite(areaRaw) || areaRaw < 0 || areaRaw > 2000)) errors.push('area');
  if (availableFrom && !/^\d{4}-\d{2}-\d{2}$/.test(availableFrom)) errors.push('availableFrom');
  if (photo && !/^https:\/\/\S+$/.test(photo)) errors.push('photo');
  if (b.consent !== true) errors.push('consent');

  return {
    ok: errors.length === 0,
    errors,
    listing: {
      name,
      email,
      phone,
      address,
      postcode: postcode.replace(/\s+/g, ''),
      city,
      type,
      price: Number.isFinite(price) ? Math.round(price) : null,
      beds: bedsRaw == null || !Number.isFinite(bedsRaw) ? null : Math.round(bedsRaw),
      area: areaRaw == null || !Number.isFinite(areaRaw) ? null : Math.round(areaRaw),
      availableFrom: availableFrom || null,
      desc,
      photo: photo || null,
    },
  };
}

function listingText(listing) {
  const rows = [
    ['Name', listing.name],
    ['Email', listing.email],
    ['Phone', listing.phone],
    ['Address', listing.address],
    ['Postcode', listing.postcode],
    ['City', listing.city],
    ['Type', listing.type],
    ['Monthly rent EUR', listing.price],
    ['Bedrooms', listing.beds == null ? '' : listing.beds],
    ['Area m2', listing.area == null ? '' : listing.area],
    ['Available from', listing.availableFrom || ''],
    ['Photo', listing.photo || ''],
    ['Description', listing.desc || ''],
  ];
  return rows.map(([k, v]) => k + ': ' + v).join('\n');
}

/** @type {typeof defaultSend | null} */
let sendImpl = null;

function httpsJson(method, host, path, { headers, body }) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { method, host, path, headers: headers || {} },
      (res) => {
        let raw = '';
        res.on('data', (c) => {
          raw += c;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = null;
          }
          if (res.statusCode >= 200 && res.statusCode < 300) return resolve(json);
          const err = new Error((json && json.message) || 'email failed ' + res.statusCode);
          err.code = 'INTAKE_EMAIL_FAILED';
          err.statusCode = res.statusCode;
          reject(err);
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function defaultSend(listing) {
  if (!resendConfigured()) {
    const err = new Error('Resend not configured');
    err.code = 'RESEND_UNAVAILABLE';
    throw err;
  }
  const text =
    'New landlord listing for review. Not published on the site.\n\n' + listingText(listing);
  const body = JSON.stringify({
    from: resendFrom(),
    to: [intakeTo()],
    reply_to: listing.email,
    subject: 'Woonwekker listing intake: ' + listing.city + ' — ' + listing.address,
    text,
  });
  return httpsJson('POST', 'api.resend.com', '/emails', {
    headers: {
      Authorization: 'Bearer ' + String(process.env.RESEND_API_KEY || '').trim(),
      'Content-Type': 'application/json',
    },
    body,
  });
}

async function sendListingIntake(listing) {
  const fn = sendImpl || defaultSend;
  return fn(listing);
}

function setListingMailForTests(fn) {
  sendImpl = fn || null;
}

const _hits = new Map();
function rateLimitIntake(ip, limit = 5, windowMs = 15 * 60 * 1000) {
  const key = String(ip || 'unknown');
  const now = Date.now();
  let arr = _hits.get(key) || [];
  arr = arr.filter((t) => now - t < windowMs);
  if (arr.length >= limit) return false;
  arr.push(now);
  _hits.set(key, arr);
  return true;
}

module.exports = {
  TYPES,
  validateListing,
  listingText,
  sendListingIntake,
  setListingMailForTests,
  rateLimitIntake,
  intakeTo,
  resendConfigured,
};
