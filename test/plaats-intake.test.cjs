'use strict';
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const plaats = require('../lib/ww-plaats.cjs');
const handler = require('../api/plaats.js');

function good(over = {}) {
  return {
    name: 'Ada Landlord',
    email: 'ada@example.com',
    phone: '+31612345678',
    address: 'Keizersgracht 1',
    postcode: '1015 AB',
    city: 'Amsterdam',
    price: 1500,
    type: 'Appartement',
    beds: 2,
    area: 60,
    availableFrom: '2026-10-01',
    desc: 'Quiet home.',
    photo: 'https://example.com/a.jpg',
    consent: true,
    ...over,
  };
}

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k] = v; },
    end(b) { this.body = b; this.json = JSON.parse(b); },
  };
}

describe('validateListing', () => {
  it('accepts a complete landlord payload', () => {
    const r = plaats.validateListing(good());
    assert.equal(r.ok, true);
    assert.equal(r.listing.postcode, '1015AB');
    assert.equal(r.listing.price, 1500);
  });
  it('rejects missing consent and bad postcode', () => {
    const r = plaats.validateListing(good({ consent: false, postcode: 'AB' }));
    assert.equal(r.ok, false);
    assert.ok(r.errors.includes('consent'));
    assert.ok(r.errors.includes('postcode'));
  });
  it('does not treat the payload as published', () => {
    const text = plaats.listingText(plaats.validateListing(good()).listing);
    assert.match(text, /Amsterdam/);
    assert.doesNotMatch(text, /published on the site: true/i);
  });
});

describe('POST /api/plaats', () => {
  const prev = process.env.RESEND_API_KEY;
  beforeEach(() => {
    plaats.setListingMailForTests(null);
  });
  afterEach(() => {
    plaats.setListingMailForTests(null);
    if (prev == null) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prev;
  });

  it('fails closed without Resend', async () => {
    delete process.env.RESEND_API_KEY;
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: good(), socket: {} }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.json.error, 'intake_unavailable');
    assert.equal(res.json.published, undefined);
  });

  it('rejects an invalid listing', async () => {
    process.env.RESEND_API_KEY = 're_test_mock';
    const res = mockRes();
    await handler({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.10' }, body: good({ email: 'nope' }), socket: {} }, res);
    assert.equal(res.statusCode, 400);
    assert.ok(res.json.fields.includes('email'));
  });

  it('sends intake and does not claim the home is live', async () => {
    process.env.RESEND_API_KEY = 're_test_mock';
    let sent = null;
    plaats.setListingMailForTests(async (listing) => { sent = listing; return { id: 'email_test' }; });
    const res = mockRes();
    await handler({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.11' }, body: good(), socket: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.published, false);
    assert.equal(sent.email, 'ada@example.com');
    assert.equal(sent.city, 'Amsterdam');
  });
});
