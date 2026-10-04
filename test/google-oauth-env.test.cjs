'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { googleConfigured, redirectUri } = require('../lib/ww-auth.cjs');

describe('google oauth env names', () => {
  it('woonwekker_google_oauth_clientid and clientsecret enable Google when the old names are unset', () => {
    const prevId = process.env.GOOGLE_CLIENT_ID;
    const prevSecret = process.env.GOOGLE_CLIENT_SECRET;
    const prevAltId = process.env.woonwekker_google_oauth_clientid;
    const prevAltSecret = process.env.woonwekker_google_oauth_clientsecret;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    process.env.woonwekker_google_oauth_clientid = 'test-client-id';
    process.env.woonwekker_google_oauth_clientsecret = 'test-client-secret';
    try {
      assert.equal(googleConfigured(), true);
      delete process.env.woonwekker_google_oauth_clientsecret;
      assert.equal(googleConfigured(), false);
    } finally {
      if (prevId === undefined) delete process.env.GOOGLE_CLIENT_ID;
      else process.env.GOOGLE_CLIENT_ID = prevId;
      if (prevSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
      else process.env.GOOGLE_CLIENT_SECRET = prevSecret;
      if (prevAltId === undefined) delete process.env.woonwekker_google_oauth_clientid;
      else process.env.woonwekker_google_oauth_clientid = prevAltId;
      if (prevAltSecret === undefined) delete process.env.woonwekker_google_oauth_clientsecret;
      else process.env.woonwekker_google_oauth_clientsecret = prevAltSecret;
    }
  });

  it('sends the redirect uri Google has saved, with www and no trailing slash', () => {
    const prev = process.env.GOOGLE_REDIRECT_URI;
    delete process.env.GOOGLE_REDIRECT_URI;
    try {
      const uri = redirectUri({ headers: { host: 'www.woonwekker.nl', 'x-forwarded-proto': 'https' } });
      assert.equal(uri, 'https://www.woonwekker.nl/api/auth/callback/google');
    } finally {
      if (prev === undefined) delete process.env.GOOGLE_REDIRECT_URI;
      else process.env.GOOGLE_REDIRECT_URI = prev;
    }
  });
});
