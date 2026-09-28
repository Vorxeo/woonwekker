'use strict';
/**
 * Woonwekker A1+A2 — client-only wekker profile + deterministic why/why-not.
 *
 * PROFILE ALLOWLIST (exact fields + max lengths). Unknown keys are stripped.
 * Nothing here is sent to any network; localStorage only.
 *
 * | field         | type            | max / constraint                                      |
 * |---------------|-----------------|-------------------------------------------------------|
 * | v             | number          | schema version (=1)                                   |
 * | city          | string          | 80 chars                                              |
 * | budget        | string/number   | max price €; digits only, ≤7 chars after sanitize     |
 * | minBudget     | string/number   | min price €; same                                     |
 * | type          | string          | '' \| Appartement \| Huis \| Studio \| Kamer           |
 * | beds          | string/number   | 0–20                                                  |
 * | area          | string/number   | min m²; 0–9999                                        |
 * | garden        | boolean         |                                                       |
 * | balcony       | boolean         |                                                       |
 * | energy        | boolean         | Energielabel A or better                              |
 * | requirePhoto  | boolean         | fail if listing has no usable photo                   |
 * | query         | string          | optional NL source text, ≤200 chars; NEVER networked  |
 *
 * Explicitly NOT stored: bio, income, name, email, phone, raw free-text beyond query.
 */
(function (global) {
  const PROFILE_KEY = 'woonwekker-wekker-profile';
  const SCHEMA_V = 1;
  const TYPE_OK = new Set(['', 'Appartement', 'Huis', 'Studio', 'Kamer']);
  const MAX = {
    city: 80,
    budget: 7,
    minBudget: 7,
    beds: 2,
    area: 4,
    query: 200
  };

  function emptyProfile() {
    return {
      v: SCHEMA_V,
      city: '',
      budget: '',
      minBudget: '',
      type: '',
      beds: '',
      area: '',
      garden: false,
      balcony: false,
      energy: false,
      requirePhoto: false,
      query: ''
    };
  }

  function dig(v, maxLen) {
    const s = String(v == null ? '' : v).replace(/[^\d]/g, '').slice(0, maxLen);
    if (!s) return '';
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? String(n) : '';
  }

  function clampBeds(v) {
    const s = dig(v, MAX.beds);
    if (s === '') return '';
    const n = Math.min(20, Math.max(0, Number(s)));
    return String(n);
  }

  function clampArea(v) {
    const s = dig(v, MAX.area);
    if (s === '') return '';
    const n = Math.min(9999, Math.max(0, Number(s)));
    return String(n);
  }

  /** Strict allowlist + truncation. Strips unknown keys. */
  function sanitizeWekkerProfile(raw) {
    const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const type = TYPE_OK.has(String(o.type || '')) ? String(o.type || '') : '';
    return {
      v: SCHEMA_V,
      city: String(o.city || '').trim().slice(0, MAX.city),
      budget: dig(o.budget, MAX.budget),
      minBudget: dig(o.minBudget, MAX.minBudget),
      type,
      beds: clampBeds(o.beds),
      area: clampArea(o.area),
      garden: !!o.garden,
      balcony: !!o.balcony,
      energy: !!o.energy,
      requirePhoto: !!o.requirePhoto,
      query: String(o.query || '').trim().slice(0, MAX.query)
    };
  }

  function loadWekkerProfile() {
    try {
      const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
      return sanitizeWekkerProfile(raw);
    } catch {
      return emptyProfile();
    }
  }

  function saveWekkerProfile(p) {
    const clean = sanitizeWekkerProfile(p);
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(clean));
    } catch (_) {}
    return clean;
  }

  function clearWekkerProfile() {
    try {
      localStorage.removeItem(PROFILE_KEY);
    } catch (_) {}
    return emptyProfile();
  }

  /** True if any matching criterion is set (query alone does not count). */
  function hasActiveCriteria(p) {
    const c = sanitizeWekkerProfile(p);
    return !!(
      c.city ||
      c.budget ||
      c.minBudget ||
      c.type ||
      c.beds ||
      c.area ||
      c.garden ||
      c.balcony ||
      c.energy ||
      c.requirePhoto
    );
  }

  function norm(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  /**
   * Deterministic NL → structured fields. No language-model / no network.
   * Known city tokens + keyword patterns only.
   */
  const CITY_TOKENS = [
    'amsterdam', 'rotterdam', 'utrecht', 'den haag', 'the hague', 'haarlem',
    'eindhoven', 'groningen', 'tilburg', 'almere', 'breda', 'nijmegen',
    'arnhem', 'leiden', 'delft', 'amersfoort', 'zwolle', 'maastricht',
    'enschede', 'hilversum', 'zaandam', 'leiden', 'haarlem'
  ];
  const CITIES = [...new Set(CITY_TOKENS.map((c) => c.trim().toLowerCase()).filter(Boolean))];

  function parseNlToProfile(text, base) {
    const out = sanitizeWekkerProfile(base || emptyProfile());
    const raw = String(text || '').trim().slice(0, MAX.query);
    out.query = raw;
    if (!raw) return out;
    const n = norm(raw);

    // types
    if (/\bkamer\b|\broom\b|\bhabitaci[oó]n\b|\bpok[oó]j\b/.test(n)) out.type = 'Kamer';
    else if (/\bstudio\b|\bkawalerka\b|\bestudio\b/.test(n)) out.type = 'Studio';
    else if (/\bappartement\b|\bapartment\b|\bmieszkanie\b|\bpiso\b/.test(n)) out.type = 'Appartement';
    else if (/\bhuis\b|\bhouse\b|\bwoning\b|\bcasa\b|\bdom\b/.test(n)) out.type = 'Huis';

    // max price: max/tot/until/hasta/do + optional €
    const maxM = n.match(/(?:max(?:imaal|imum)?|tot|until|under|hasta|do|<=|≤)\s*€?\s*(\d{3,5})\b/) ||
      n.match(/€\s*(\d{3,5})\s*(?:max|p\.?\s*m|per\s*maand|\/mnd|\/mo)?/) ||
      n.match(/\b(\d{3,5})\s*(?:euro|eur)\b/);
    if (maxM) out.budget = dig(maxM[1], MAX.budget);

    // min price
    const minM = n.match(/(?:min(?:imaal|imum)?|vanaf|from|desde|od|>=|≥)\s*€?\s*(\d{3,5})\b/);
    if (minM) out.minBudget = dig(minM[1], MAX.minBudget);

    // beds
    const bedM = n.match(/(\d{1,2})\s*(?:\+|plus)?\s*(?:slaapkamers?|bedrooms?|beds?|habitaciones?|sypialn\w*)/);
    if (bedM) out.beds = clampBeds(bedM[1]);

    // area
    const areaM = n.match(/(?:min\.?\s*)?(\d{2,4})\s*(?:m2|m²|sqm|meter)/);
    if (areaM) out.area = clampArea(areaM[1]);

    // features
    if (/\btuin\b|\bgarden\b|\bjard[ií]n\b|\bogrod/.test(n)) out.garden = true;
    if (/\bbalkon\b|\bbalcony\b|\bbalc[oó]n\b/.test(n)) out.balcony = true;
    if (/\benergielabel\s*a\b|\benergy\s*(?:label\s*)?a\b|\blabel\s*a\b/.test(n)) out.energy = true;
    if (/\b(met\s+foto|with\s+photo|con\s+foto|ze\s+zdj|require\s+photo|foto\s+verplicht)/.test(n)) {
      out.requirePhoto = true;
    }

    // city: "in Amsterdam" / bare known city
    let cityHit = '';
    const inM = n.match(/\b(?:in|te|en|w|we)\s+([a-z][a-z\s-]{1,40})/);
    if (inM) {
      const cand = inM[1].trim();
      for (const c of CITIES) {
        if (cand === c || cand.startsWith(c + ' ') || cand.startsWith(c + ',')) {
          cityHit = c;
          break;
        }
      }
    }
    if (!cityHit) {
      for (const c of CITIES) {
        if (new RegExp('\\b' + c.replace(/\s+/g, '\\s+') + '\\b').test(n)) {
          cityHit = c;
          break;
        }
      }
    }
    if (cityHit) {
      // Title-case simple
      out.city = cityHit.replace(/\b\w/g, (ch) => ch.toUpperCase()).slice(0, MAX.city);
      if (out.city === 'Den Haag' || cityHit === 'the hague') out.city = 'Den Haag';
    }

    return sanitizeWekkerProfile(out);
  }

  /** Map profile → existing filters object fields (enhancements/app). */
  function applyProfileToFilters(profile, filtersObj) {
    if (!filtersObj || typeof filtersObj !== 'object') return filtersObj;
    const p = sanitizeWekkerProfile(profile);
    filtersObj.city = p.city || '';
    filtersObj.budget = p.budget || '';
    filtersObj.minBudget = p.minBudget || '';
    filtersObj.type = p.type || '';
    filtersObj.beds = p.beds || '';
    filtersObj.area = p.area || '';
    filtersObj.garden = !!p.garden;
    filtersObj.balcony = !!p.balcony;
    filtersObj.energy = !!p.energy;
    // ptype left alone (page kind); concrete type wins via filters.type
    return filtersObj;
  }

  /** Snapshot current filters into a sanitized profile (keeps prior query). */
  function profileFromFilters(filtersObj, prev) {
    const f = filtersObj || {};
    const base = sanitizeWekkerProfile(prev || emptyProfile());
    let type = '';
    if (TYPE_OK.has(String(f.type || ''))) type = String(f.type || '');
    else if (TYPE_OK.has(String(f.ptype || ''))) type = String(f.ptype || '');
    return sanitizeWekkerProfile({
      ...base,
      city: f.city || '',
      budget: f.budget || '',
      minBudget: f.minBudget || '',
      type,
      beds: f.beds || '',
      area: f.area || '',
      garden: !!f.garden,
      balcony: !!f.balcony,
      energy: !!f.energy,
      requirePhoto: base.requirePhoto,
      query: base.query
    });
  }

  function listingHasPhoto(p) {
    if (!p) return false;
    if (p.photo && String(p.photo).trim()) return true;
    if (Number(p.photoCount) > 0) return true;
    return Object.keys(p).some((k) => /^photos\/\d+$/.test(k) && p[k]);
  }

  /**
   * Deterministic rule outcomes only. Returns null when no criteria (fail-closed).
   * { passes: [{id, params}], fails: [{id, params}] }
   * ids are i18n keys under whyPass* / whyFail* — neutral wording only.
   */
  function explainListing(listing, profile) {
    const c = sanitizeWekkerProfile(profile);
    if (!hasActiveCriteria(c)) return null;
    const passes = [];
    const fails = [];
    const p = listing || {};

    if (c.city) {
      const hay = norm([p.city, p.address, p.neighbourhood, p.postalCode].join(' '));
      if (hay.includes(norm(c.city))) passes.push({ id: 'whyPassCity', params: { city: c.city } });
      else fails.push({ id: 'whyFailCity', params: { city: c.city } });
    }
    if (c.budget) {
      const price = p.price !== '' && p.price != null ? Number(p.price) : NaN;
      if (Number.isFinite(price) && price <= Number(c.budget)) {
        passes.push({ id: 'whyPassBudget', params: { budget: c.budget } });
      } else {
        fails.push({ id: 'whyFailBudget', params: { budget: c.budget } });
      }
    }
    if (c.minBudget) {
      const price = p.price !== '' && p.price != null ? Number(p.price) : NaN;
      if (Number.isFinite(price) && price >= Number(c.minBudget)) {
        passes.push({ id: 'whyPassMinBudget', params: { minBudget: c.minBudget } });
      } else {
        fails.push({ id: 'whyFailMinBudget', params: { minBudget: c.minBudget } });
      }
    }
    if (c.type) {
      if (p.propertyType === c.type) passes.push({ id: 'whyPassType', params: { type: c.type } });
      else fails.push({ id: 'whyFailType', params: { type: c.type } });
    }
    if (c.beds !== '') {
      const beds = p.bedrooms !== '' && p.bedrooms != null ? Number(p.bedrooms) : NaN;
      if (Number.isFinite(beds) && beds >= Number(c.beds)) {
        passes.push({ id: 'whyPassBeds', params: { beds: c.beds } });
      } else {
        fails.push({ id: 'whyFailBeds', params: { beds: c.beds } });
      }
    }
    if (c.area) {
      const area = p.livingArea !== '' && p.livingArea != null ? Number(p.livingArea) : NaN;
      if (Number.isFinite(area) && area >= Number(c.area)) {
        passes.push({ id: 'whyPassArea', params: { area: c.area } });
      } else {
        fails.push({ id: 'whyFailArea', params: { area: c.area } });
      }
    }
    if (c.garden) {
      if (p.garden === 'true' || p.garden === true) passes.push({ id: 'whyPassGarden', params: {} });
      else fails.push({ id: 'whyFailGarden', params: {} });
    }
    if (c.balcony) {
      if (p.balcony === 'true' || p.balcony === true) passes.push({ id: 'whyPassBalcony', params: {} });
      else fails.push({ id: 'whyFailBalcony', params: {} });
    }
    if (c.energy) {
      if (/^A\+*$/.test(String(p.energyLabel || ''))) passes.push({ id: 'whyPassEnergy', params: {} });
      else fails.push({ id: 'whyFailEnergy', params: {} });
    }
    if (c.requirePhoto) {
      if (listingHasPhoto(p)) passes.push({ id: 'whyPassPhoto', params: {} });
      else fails.push({ id: 'whyFailPhoto', params: {} });
    }
    return { passes, fails };
  }

  /** Format rule id → localized short string via t(). Neutral; no overclaim wording. */
  function formatWhyItem(item, tFn, moneyFn) {
    const t = typeof tFn === 'function' ? tFn : (k) => k;
    const money = typeof moneyFn === 'function' ? moneyFn : (n) => '€' + n;
    const id = item.id;
    const p = item.params || {};
    const tpl = t(id);
    if (!tpl) return '';
    return String(tpl)
      .replace(/\{city\}/g, p.city || '')
      .replace(/\{type\}/g, p.type || '')
      .replace(/\{beds\}/g, p.beds || '')
      .replace(/\{area\}/g, p.area || '')
      .replace(/\{budget\}/g, p.budget ? money(p.budget) : '')
      .replace(/\{minBudget\}/g, p.minBudget ? money(p.minBudget) : '');
  }

  function renderWhyHtml(listing, profile, deps) {
    const t = deps && deps.t;
    const esc = deps && deps.esc ? deps.esc : (v) => String(v ?? '');
    const money = deps && deps.money;
    if (!hasActiveCriteria(profile)) {
      const hint = typeof t === 'function' ? t('whyNeedProfile') : '';
      if (!hint) return '';
      return `<details class="ww-why ww-why-empty"><summary>${esc(t('whyLabel'))}</summary><p class="ww-why-hint">${esc(hint)}</p></details>`;
    }
    const expl = explainListing(listing, profile);
    if (!expl) return '';
    const passHtml = expl.passes
      .map((it) => {
        const label = formatWhyItem(it, t, money);
        return label ? `<li class="ww-why-pass">${esc(label)}</li>` : '';
      })
      .join('');
    const failHtml = expl.fails
      .map((it) => {
        const label = formatWhyItem(it, t, money);
        return label ? `<li class="ww-why-fail">${esc(label)}</li>` : '';
      })
      .join('');
    if (!passHtml && !failHtml) return '';
    const summary =
      expl.fails.length === 0
        ? typeof t === 'function'
          ? t('whySummaryPass')
          : 'Match'
        : typeof t === 'function'
          ? t('whySummaryMixed')
          : 'Partial';
    return `<details class="ww-why"><summary>${esc(summary)}</summary><ul class="ww-why-list">${passHtml}${failHtml}</ul></details>`;
  }

  /**
   * Sanitize a zoekprofiel entry (account.js) onto the same allowlist idea.
   * Keeps id/name/active; strips unknown; no bio/income.
   */
  function sanitizeZoekprofiel(z) {
    const o = z && typeof z === 'object' ? z : {};
    const type = TYPE_OK.has(String(o.type || '')) ? String(o.type || '') : '';
    return {
      id: String(o.id || '').slice(0, 40),
      name: String(o.name || '').trim().slice(0, 60),
      city: String(o.city || '').trim().slice(0, MAX.city),
      maxPrice: dig(o.maxPrice != null ? o.maxPrice : o.budget, MAX.budget),
      minBeds: clampBeds(o.minBeds != null ? o.minBeds : o.beds),
      type,
      active: !!o.active
    };
  }

  function profileFromZoekprofiel(z) {
    const s = sanitizeZoekprofiel(z);
    return sanitizeWekkerProfile({
      city: s.city,
      budget: s.maxPrice,
      type: s.type,
      beds: s.minBeds,
      query: ''
    });
  }

  const api = {
    PROFILE_KEY,
    SCHEMA_V,
    TYPE_OK,
    MAX,
    emptyProfile,
    sanitizeWekkerProfile,
    loadWekkerProfile,
    saveWekkerProfile,
    clearWekkerProfile,
    hasActiveCriteria,
    parseNlToProfile,
    applyProfileToFilters,
    profileFromFilters,
    explainListing,
    formatWhyItem,
    renderWhyHtml,
    sanitizeZoekprofiel,
    profileFromZoekprofiel,
    listingHasPhoto
  };

  global.WWWekker = api;
})(typeof window !== 'undefined' ? window : globalThis);
