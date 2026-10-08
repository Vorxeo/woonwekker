'use strict';
// Legal page content for the 8 site languages. Dutch (nl) is authoritative.
// Privacy sections given as 'KEEP:n' reuse section n of the existing
// privacySections copy for that language (Account, device storage, code,
// Google Ads, rights), which build-compliance.cjs resolves from content.js.
const LANGS = ['nl', 'en', 'es', 'pl', 'pt', 'ro', 'bg', 'it'];
const LEGAL = {};
for (const lang of LANGS) LEGAL[lang] = require(`./legal/${lang}.cjs`);
module.exports = { LANGS, LEGAL };
