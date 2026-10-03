'use strict';
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const alert = require('../lib/ww-email-alert.cjs');
const mail = require('../lib/ww-bellen-mail.cjs');
const layout = require('../lib/ww-mail-layout.cjs');

const FORBIDDEN = /vorxeo|pararius|kamernet|funda|whatsapp|snapshot|third-party|third party/i;

function saved(over = {}) {
  return {
    emailConfirmed: true,
    city: 'Amsterdam',
    maxPrice: '2000',
    type: 'Appartement',
    ...over,
  };
}

function listing(over = {}) {
  return {
    city: 'Amsterdam',
    price: '1500',
    propertyType: 'Appartement',
    address: 'Keizersgracht 1',
    url: 'https://example.com/woning/1',
    ...over,
  };
}

describe('listing email alert', () => {
  let calls;
  let prevKey;
  let prevAlt;

  beforeEach(() => {
    calls = [];
    prevKey = process.env.RESEND_API_KEY;
    prevAlt = process.env.woonwekker_resend_api_key;
    delete process.env.RESEND_API_KEY;
    delete process.env.woonwekker_resend_api_key;
    mail.setResendRequestForTests(async () => {
      calls.push('resend');
      throw new Error('network must not be called');
    });
  });

  afterEach(() => {
    mail.setResendRequestForTests(null);
    if (prevKey == null) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
    if (prevAlt == null) delete process.env.woonwekker_resend_api_key;
    else process.env.woonwekker_resend_api_key = prevAlt;
  });

  it('does not send when confirmation is missing, false, or not strictly true', async () => {
    const cases = [
      {},
      { notifications: { city: 'Amsterdam', maxPrice: '2000', type: 'Appartement' } },
      { notifications: saved({ emailConfirmed: false }) },
      { notifications: saved({ emailConfirmed: 'true' }) },
      { notifications: saved({ emailConfirmed: 1 }) },
      { alerts: { email: true }, notifications: saved({ emailConfirmed: false }) },
    ];
    for (const extra of cases) {
      const result = await alert.prepareListingAlert({
        email: 'person@example.com',
        listing: listing(),
        send: true,
        ...extra,
      });
      assert.equal(result.sent, false);
      assert.equal(result.reason, 'no_opt_in');
      assert.equal(result.payload, null);
    }
    assert.equal(calls.length, 0);
  });

  it('does not send when city, price, or type does not fit', async () => {
    const mismatches = [
      listing({ city: 'Rotterdam' }),
      listing({ price: '2001' }),
      listing({ propertyType: 'Huis' }),
      listing({ city: '' }),
      listing({ price: '' }),
      listing({ propertyType: '' }),
      listing({ city: null, price: null, propertyType: null }),
    ];
    for (const row of mismatches) {
      const result = await alert.prepareListingAlert({
        email: 'person@example.com',
        notifications: saved(),
        listing: row,
      });
      assert.equal(result.sent, false);
      assert.equal(result.reason, 'no_match');
      assert.equal(result.payload, null);
    }
    assert.equal(calls.length, 0);
  });

  it('does not treat a missing saved city, price, or type as a wildcard', async () => {
    const setups = [
      saved({ city: '' }),
      saved({ maxPrice: '' }),
      saved({ type: '' }),
      { emailConfirmed: true },
    ];
    for (const notifications of setups) {
      const result = await alert.prepareListingAlert({
        email: 'person@example.com',
        notifications,
        listing: listing(),
        send: true,
      });
      assert.equal(result.sent, false);
      assert.equal(result.reason, 'no_match');
    }
    assert.equal(calls.length, 0);
  });

  it('builds a payload for a confirmed match and does not call Resend', async () => {
    process.env.RESEND_API_KEY = 're_test_should_not_send';
    const result = await alert.prepareListingAlert({
      email: 'person@example.com',
      notifications: saved(),
      listing: listing(),
    });
    assert.equal(result.sent, false);
    assert.equal(result.reason, 'prepare_only');
    assert.equal(calls.length, 0);
    const payload = result.payload;
    assert.equal(payload.to[0], 'person@example.com');
    assert.match(payload.subject, /Amsterdam/);
    assert.match(payload.text, /https:\/\/example.com\/woning\/1/);
    assert.match(payload.html, /https:\/\/example.com\/woning\/1/);
    assert.match(payload.text, /Amsterdam/);
    assert.match(payload.text, /€1500/);
    assert.match(payload.text, /€2000/);
    assert.match(payload.text, /Appartement/);
    assert.match(payload.text, /Past bij je melding/);
    assert.ok(payload.text.trimEnd().endsWith('Woonwekker'));
    assert.ok(payload.html.includes('Woonwekker'));
    assert.doesNotMatch(payload.text, FORBIDDEN);
    assert.doesNotMatch(payload.html, FORBIDDEN);
    assert.doesNotMatch(payload.subject, FORBIDDEN);
  });

  it('uses the account email and ignores a second address on the notification', async () => {
    const result = await alert.prepareListingAlert({
      profile: { email: 'account@example.com' },
      notifications: saved(),
      notificationEmail: 'other@example.com',
      listing: listing(),
    });
    assert.equal(result.payload.to[0], 'account@example.com');
  });

  it('fails closed without a Resend key when send is explicitly requested', async () => {
    const result = await alert.prepareListingAlert({
      email: 'person@example.com',
      notifications: saved(),
      listing: listing(),
      send: true,
    });
    assert.equal(result.sent, false);
    assert.equal(result.reason, 'resend_unavailable');
    assert.equal(calls.length, 0);
    assert.ok(result.payload.text.trimEnd().endsWith('Woonwekker'));
  });
});

describe('existing Resend templates close with Woonwekker', () => {
  it('signup, B, C, D, and plaats templates end with the signature and invent nothing new', () => {
    const root = path.join(__dirname, '..');
    const auth = fs.readFileSync(path.join(root, 'lib/ww-auth.cjs'), 'utf8');
    const bellen = fs.readFileSync(path.join(root, 'lib/ww-bellen-mail.cjs'), 'utf8');
    const plaats = fs.readFileSync(path.join(root, 'lib/ww-plaats.cjs'), 'utf8');
    for (const src of [auth, bellen, plaats]) {
      assert.match(src, /professionalEmail/);
      assert.doesNotMatch(src, /whatsapp/i);
    }
    assert.match(auth, /Bevestig je e-mailadres voor Woonwekker/);
    assert.match(bellen, /€18,50 per maand/);
    assert.match(bellen, /betaling voor Bellen is mislukt/);
    assert.match(bellen, /Bellen-abonnement is opgezegd/);
    assert.match(plaats, /Not published on the site/);
    assert.equal(layout.SIGNATURE, 'Woonwekker');
    const sample = layout.professionalEmail({ paragraphs: ['Feit.'] });
    assert.ok(sample.text.endsWith('Woonwekker'));
    assert.doesNotMatch(sample.text, /vorxeo/i);
  });
});

describe('account notifications section', () => {
  const account = fs.readFileSync(path.join(__dirname, '../dist/account.js'), 'utf8');
  const content = fs.readFileSync(path.join(__dirname, '../dist/content.js'), 'utf8');

  it('has a Notifications section that saves confirmation, city, max price, and type', () => {
    assert.match(account, /function notificationsPanel/);
    assert.match(account, /id="notify-section"/);
    assert.match(account, /name="emailConfirmed"/);
    assert.match(account, /name="city"/);
    assert.match(account, /name="maxPrice"/);
    assert.match(account, /name="type"/);
    assert.match(account, /emailConfirmed:false/);
    assert.match(account, /emailConfirmed:o\.emailConfirmed===true/);
    const start = account.indexOf('function notificationsPanel');
    const end = account.indexOf('function zoekPanel');
    const panel = account.slice(start, end);
    assert.doesNotMatch(panel, /whatsapp/i);
    assert.doesNotMatch(panel, /type="email"/i);
    assert.equal(content.match(/"notifyTitle"/g).length, 8);
  });
});
