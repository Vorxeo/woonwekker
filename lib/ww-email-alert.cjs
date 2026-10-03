'use strict';
/**
 * Listing email alerts. Prepare-only unless the caller passes send: true.
 * Opt-in is emailConfirmed === true. Anything else does not send.
 * A listing matches only when its own city, price, and propertyType all fit
 * the saved city, maximum price, and type. A missing field is not a wildcard.
 */
const { citySlug } = require('./ww-city.cjs');
const { professionalEmail } = require('./ww-mail-layout.cjs');
const { resendFrom, sendResendEmail } = require('./ww-bellen-mail.cjs');

const TYPES = new Set(['Appartement', 'Huis', 'Studio', 'Kamer']);

function emptyNotifications() {
  return { emailConfirmed: false, city: '', maxPrice: '', type: '' };
}

function sanitizeNotifications(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const type = TYPES.has(String(o.type || '')) ? String(o.type) : '';
  const digits = String(o.maxPrice == null ? '' : o.maxPrice).replace(/[^\d]/g, '').slice(0, 7);
  return {
    emailConfirmed: o.emailConfirmed === true,
    city: String(o.city || '').trim().slice(0, 80),
    maxPrice: digits,
    type,
  };
}

function accountEmail(input) {
  const src = input && typeof input === 'object' ? input : {};
  const direct = src.email != null ? src.email : src.profile && src.profile.email;
  return String(direct || '').trim().slice(0, 120);
}

function notificationsFrom(input) {
  const src = input && typeof input === 'object' ? input : {};
  if (src.notifications && typeof src.notifications === 'object') {
    return sanitizeNotifications(src.notifications);
  }
  return sanitizeNotifications(src);
}

function isEmailOptInConfirmed(notifications) {
  return sanitizeNotifications(notifications).emailConfirmed === true;
}

function listingCity(listing) {
  return String(listing && listing.city != null ? listing.city : '').trim();
}

function listingType(listing) {
  return String(listing && listing.propertyType != null ? listing.propertyType : '').trim();
}

function listingPrice(listing) {
  if (!listing || listing.price == null || listing.price === '') return null;
  const n = typeof listing.price === 'number' ? listing.price : Number(String(listing.price).trim());
  if (!Number.isFinite(n)) return null;
  return n;
}

function maxPriceNumber(notifications) {
  const digits = sanitizeNotifications(notifications).maxPrice;
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/**
 * All three saved fields and all three listing fields are required.
 * @returns {{ ok: boolean, why: string }}
 */
function matchListing(notifications, listing) {
  const saved = sanitizeNotifications(notifications);
  const savedCity = citySlug(saved.city);
  const cap = maxPriceNumber(saved);
  if (!savedCity) return { ok: false, why: 'setup_city' };
  if (cap == null) return { ok: false, why: 'setup_price' };
  if (!saved.type) return { ok: false, why: 'setup_type' };

  const city = listingCity(listing);
  const price = listingPrice(listing);
  const type = listingType(listing);
  if (!city || !citySlug(city)) return { ok: false, why: 'listing_city' };
  if (price == null) return { ok: false, why: 'listing_price' };
  if (!type) return { ok: false, why: 'listing_type' };

  if (citySlug(city) !== savedCity) return { ok: false, why: 'city' };
  if (price > cap) return { ok: false, why: 'price' };
  if (type !== saved.type) return { ok: false, why: 'type' };
  return { ok: true, why: 'match', city, price, type, maxPrice: cap };
}

function euro(amount) {
  return '€' + String(amount);
}

function buildAlertMail({ listing, match }) {
  const city = match.city;
  const price = match.price;
  const type = match.type;
  const address = String(listing && listing.address ? listing.address : '').trim();
  const where = address ? address + ', ' + city : city;
  const reason =
    'Past bij je melding: stad ' +
    city +
    ', huur ' +
    euro(price) +
    ' (maximaal ' +
    euro(match.maxPrice) +
    '), type ' +
    type +
    '.';
  const content = professionalEmail({
    paragraphs: ['Hoi,', 'Er is een woning die past bij wat je bewaarde.', where, reason],
    link: listing && listing.url,
    linkLabel: 'Bekijk de woning',
  });
  return {
    subject: 'Woonwekker: woning in ' + city,
    html: content.html,
    text: content.text,
  };
}

/**
 * Builds the Resend payload when the person confirmed and the listing fits.
 * Does not call Resend unless send === true.
 */
async function prepareListingAlert(input) {
  const src = input && typeof input === 'object' ? input : {};
  const notifications = notificationsFrom(src);
  if (notifications.emailConfirmed !== true) {
    return { sent: false, reason: 'no_opt_in', payload: null };
  }
  const match = matchListing(notifications, src.listing);
  if (!match.ok) {
    return { sent: false, reason: 'no_match', why: match.why, payload: null };
  }
  const email = accountEmail(src);
  const mail = buildAlertMail({ listing: src.listing, match });
  const payload = {
    from: resendFrom(),
    to: email ? [email] : [],
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  };
  if (src.send !== true) {
    return { sent: false, reason: 'prepare_only', payload };
  }
  if (!email || !email.includes('@')) {
    return { sent: false, reason: 'no_recipient', payload };
  }
  const result = await sendResendEmail({
    to: email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });
  return {
    sent: !!result.sent,
    reason: result.sent ? 'sent' : result.reason || 'resend_unavailable',
    payload,
    id: result.id,
  };
}

module.exports = {
  TYPES,
  emptyNotifications,
  sanitizeNotifications,
  isEmailOptInConfirmed,
  matchListing,
  buildAlertMail,
  prepareListingAlert,
};
