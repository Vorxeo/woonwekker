'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dist = path.join(__dirname, '..', 'dist');
const TAG = 'AW-18493510630';

function walkHtml(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkHtml(full, acc);
    else if (name.endsWith('.html')) acc.push(full);
  }
  return acc;
}

describe('Google Ads tag + Consent Mode v2', () => {
  it('ships cookie-consent.js with accept/reject and localStorage key', () => {
    const js = fs.readFileSync(path.join(dist, 'cookie-consent.js'), 'utf8');
    assert.match(js, /woonwekker-cookie-consent/);
    assert.match(js, /woonwekker-language/);
    assert.match(js, /consent',\s*'update'/);
    assert.match(js, /ad_storage/);
    assert.match(js, /data-ww-consent="accept"/);
    assert.match(js, /data-ww-consent="reject"/);
    assert.match(js, /\/privacy\//);
    assert.equal(/vorxeo/i.test(js), false);
    for (const lang of ['nl', 'en', 'es', 'pl', 'pt', 'ro', 'bg', 'it']) {
      assert.match(js, new RegExp(`\\b${lang}\\s*:`));
    }
  });

  it('puts the Ads tag and consent default in every dist HTML page', () => {
    const files = walkHtml(dist);
    assert.equal(files.length > 20, true);
    for (const file of files) {
      const html = fs.readFileSync(file, 'utf8');
      assert.match(html, new RegExp(TAG));
      assert.match(html, /gtag\('consent','default'/);
      assert.match(html, /ad_storage:'denied'/);
      assert.match(html, /ad_user_data:'denied'/);
      assert.match(html, /ad_personalization:'denied'/);
      assert.match(html, /analytics_storage:'denied'/);
      assert.match(html, /wait_for_update:500/);
      assert.match(html, /googletagmanager\.com\/gtag\/js\?id=AW-18493510630/);
      assert.match(html, /gtag\('config','AW-18493510630'\)/);
      assert.match(html, /\/cookie-consent\.js/);
      assert.equal(/vorxeo/i.test(html), false);
      assert.match(html, /42108778/);
      assert.match(html, /NL005499683B86/);
    }
  });

  it('documents Google Ads after consent on the privacy page copy', () => {
    const src = fs.readFileSync(path.join(dist, 'content.js'), 'utf8');
    const sandbox = {};
    vm.runInNewContext(src + '\nthis.copy=copy;', sandbox);
    for (const lang of ['nl', 'en', 'es', 'pl', 'pt', 'ro', 'bg', 'it']) {
      const sections = sandbox.copy[lang].privacySections;
      const ads = sections.find((s) => s[0] === 'Google Ads');
      assert.ok(ads, lang);
      assert.match(ads[1], new RegExp(TAG));
      assert.match(ads[1], /Consent Mode|consentimento|consimțământ|съгласие|consenso|zgody|consentimiento/i);
    }
  });

  it('renders the banner, stores choice, and updates gtag consent', () => {
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
    const consentJs = fs.readFileSync(path.join(dist, 'cookie-consent.js'), 'utf8');
    const store = new Map();
    const gtagCalls = [];
    let bannerEl = null;
    let clickHandler = null;

    function makeEl() {
      return {
        id: '',
        className: '',
        _html: '',
        parentNode: { removeChild() { bannerEl = null; } },
        setAttribute() {},
        addEventListener(type, fn) {
          if (type === 'click') clickHandler = fn;
        },
        get innerHTML() { return this._html; },
        set innerHTML(v) { this._html = String(v); },
      };
    }

    const document = {
      readyState: 'complete',
      body: {
        appendChild(el) {
          bannerEl = el;
          return el;
        },
      },
      getElementById(id) {
        return bannerEl && bannerEl.id === id ? bannerEl : null;
      },
      createElement() {
        return makeEl();
      },
      addEventListener() {},
    };

    const sandbox = {
      document,
      localStorage: {
        getItem(k) { return store.has(k) ? store.get(k) : null; },
        setItem(k, v) { store.set(k, String(v)); },
        removeItem(k) { store.delete(k); },
      },
      gtag() { gtagCalls.push([...arguments]); },
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(consentJs, sandbox);

    assert.ok(bannerEl);
    assert.equal(bannerEl.id, 'ww-cookie-banner');
    assert.match(bannerEl.innerHTML, /data-ww-consent="accept"/);
    assert.match(bannerEl.innerHTML, /data-ww-consent="reject"/);
    assert.match(bannerEl.innerHTML, /\/privacy\//);
    assert.ok(typeof clickHandler === 'function');

    clickHandler({
      target: {
        closest(sel) {
          if (sel !== '[data-ww-consent]') return null;
          return { getAttribute: (k) => (k === 'data-ww-consent' ? 'accept' : null) };
        },
      },
    });

    assert.equal(store.get('woonwekker-cookie-consent'), 'accepted');
    assert.equal(bannerEl, null);
    assert.ok(
      gtagCalls.some(
        (c) => c[0] === 'consent' && c[1] === 'update' && c[2] && c[2].ad_storage === 'granted'
      )
    );

    // Reload path restores granted consent without showing the banner again
    gtagCalls.length = 0;
    bannerEl = null;
    clickHandler = null;
    vm.runInContext(consentJs, sandbox);
    assert.equal(bannerEl, null);
    assert.ok(
      gtagCalls.some(
        (c) => c[0] === 'consent' && c[1] === 'update' && c[2] && c[2].ad_storage === 'granted'
      )
    );

    assert.match(html, /gtag\('consent','default'/);
    assert.match(html, new RegExp(TAG));
  });
});
