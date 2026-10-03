'use strict';
/**
 * Contract PDF reader + arrival checklist.
 * Quotes only text that was extracted from the PDF. No legal conclusion.
 */
(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.WWContract = api;
})(function () {
  const MAX_BYTES = 8 * 1024 * 1024;
  const MAX_TEXT = 200000;

  function toU8(input) {
    if (input instanceof Uint8Array) return input;
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) return new Uint8Array(input);
    return new Uint8Array(input);
  }

  async function inflate(u8) {
    if (typeof DecompressionStream !== 'function') {
      const err = new Error('no_inflate');
      err.code = 'no_inflate';
      throw err;
    }
    const ds = new DecompressionStream('deflate');
    const stream = new Blob([u8]).stream().pipeThrough(ds);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  }

  function latin1(u8) {
    let s = '';
    const n = u8.length;
    const chunk = 0x8000;
    for (let i = 0; i < n; i += chunk) {
      s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(n, i + chunk)));
    }
    return s;
  }

  function readLiteral(s, i) {
    let out = '';
    i += 1;
    while (i < s.length) {
      const c = s[i];
      if (c === '\\') {
        const n = s[i + 1];
        if (n == null) break;
        if (n === 'n') out += '\n';
        else if (n === 'r') out += '\r';
        else if (n === 't') out += '\t';
        else if (n === '(' || n === ')' || n === '\\') out += n;
        else if (/[0-7]/.test(n)) {
          let oct = n;
          let k = i + 2;
          for (let h = 0; h < 2 && k < s.length && /[0-7]/.test(s[k]); h++, k++) oct += s[k];
          out += String.fromCharCode(parseInt(oct, 8) & 255);
          i = k;
          continue;
        } else out += n;
        i += 2;
        continue;
      }
      if (c === ')') return { str: out, next: i + 1 };
      out += c;
      i += 1;
    }
    return { str: out, next: i };
  }

  function readHex(s, i) {
    const end = s.indexOf('>', i + 1);
    if (end < 0) return { str: '', next: i + 1 };
    let hex = s.slice(i + 1, end).replace(/[^0-9A-Fa-f]/g, '');
    if (hex.length % 2) hex += '0';
    let out = '';
    for (let k = 0; k < hex.length; k += 2) out += String.fromCharCode(parseInt(hex.slice(k, k + 2), 16));
    return { str: out, next: end + 1 };
  }

  function stringsFromContent(s) {
    if (!/(\bTj\b|\bTJ\b|\bBT\b)/.test(s)) return '';
    const parts = [];
    let i = 0;
    while (i < s.length) {
      if (s[i] === '(') {
        const lit = readLiteral(s, i);
        if (lit.str.trim()) parts.push(lit.str);
        i = lit.next;
        continue;
      }
      if (s[i] === '<' && s[i + 1] !== '<') {
        const hex = readHex(s, i);
        if (hex.str.trim() && /[\x20-\x7E]/.test(hex.str)) parts.push(hex.str);
        i = hex.next;
        continue;
      }
      i += 1;
    }
    return parts.join('\n');
  }

  function skipStream(dict) {
    if (/\/Subtype\s*\/Image\b/.test(dict)) return true;
    if (/begincmap|\/CMapName\b/.test(dict)) return true;
    const filter = dict.match(/\/Filter\s*(\[[^\]]*\]|\/[A-Za-z0-9]+)/);
    if (!filter) return false;
    const names = filter[1].match(/\/[A-Za-z0-9]+/g) || [];
    return names.some((n) => n !== '/FlateDecode');
  }

  async function decodeStream(dict, bytes) {
    if (!/\/FlateDecode\b/.test(dict)) return bytes;
    try {
      return await inflate(bytes);
    } catch {
      return null;
    }
  }

  async function extractPdfText(input) {
    const u8 = toU8(input);
    if (!u8.length || u8.length > MAX_BYTES) return { ok: false, reason: 'unreadable', text: '' };
    const head = latin1(u8.subarray(0, Math.min(u8.length, 1024)));
    if (!head.includes('%PDF-')) return { ok: false, reason: 'not_pdf', text: '' };
    const probe = latin1(u8.subarray(0, Math.min(u8.length, 65536)));
    if (/\/Encrypt\b/.test(probe)) return { ok: false, reason: 'unreadable', text: '' };

    const chunks = [];
    let i = 0;
    while (i < u8.length) {
      if (u8[i] !== 115) { i += 1; continue; } /* s */
      if (i > 0 && u8[i - 1] === 100) { i += 1; continue; } /* endstream */
      const prev = i > 0 ? u8[i - 1] : 10;
      if (prev !== 10 && prev !== 13 && prev !== 32) { i += 1; continue; }
      const window = latin1(u8.subarray(i, Math.min(u8.length, i + 8)));
      if (!window.startsWith('stream')) {
        i += 1;
        continue;
      }
      let start = i + 6;
      if (u8[start] === 13) start += 1;
      if (u8[start] === 10) start += 1;
      const back = latin1(u8.subarray(Math.max(0, i - 600), i));
      const dictStart = back.lastIndexOf('<<');
      const dict = dictStart >= 0 ? back.slice(dictStart) : '';
      const lenMatch = dict.match(/\/Length\s+(\d+)/);
      let end = -1;
      let data;
      if (lenMatch) {
        const len = Number(lenMatch[1]);
        if (!Number.isFinite(len) || len < 0 || start + len > u8.length) {
          i = start;
          continue;
        }
        data = u8.subarray(start, start + len);
        end = start + len;
      } else {
        const rest = latin1(u8.subarray(start));
        const rel = rest.indexOf('endstream');
        if (rel < 0) break;
        data = u8.subarray(start, start + rel);
        end = start + rel;
      }
      if (!skipStream(dict)) {
        const decoded = await decodeStream(dict, data);
        if (decoded) {
          const text = stringsFromContent(latin1(decoded));
          if (text.trim()) chunks.push(text);
        }
      }
      i = Math.max(end, i + 6);
      if (chunks.join('\n').length > MAX_TEXT) break;
    }
    const text = chunks.join('\n').slice(0, MAX_TEXT).replace(/\u0000/g, '').trim();
    if (!text) return { ok: false, reason: 'unreadable', text: '' };
    return { ok: true, reason: 'ok', text };
  }

  function sentences(text) {
    return String(text)
      .split(/\n+|(?<=[.!?])\s+/)
      .map((s) => s.replace(/[ \t]+/g, ' ').trim())
      .filter((s) => s.length > 1 && s.length < 500);
  }

  function pick(text, re, limit) {
    const hits = [];
    for (const s of sentences(text)) {
      if (re.test(s) && text.includes(s)) hits.push(s);
      if (hits.length >= limit) break;
    }
    return hits;
  }

  function parseEuro(s) {
    const src = String(s);
    const m =
      src.match(/(?:€|EUR|euro)\s*([0-9]{1,3}(?:[.\s\u00A0][0-9]{3})+(?:[.,][0-9]{2})?|[0-9]+(?:[.,][0-9]{2})?)/i) ||
      src.match(/([0-9]{1,3}(?:[.\s\u00A0][0-9]{3})+(?:[.,][0-9]{2})?|[0-9]+(?:[.,][0-9]{2})?)\s*(?:€|EUR|euro)/i);
    if (!m) return null;
    let n = m[1].replace(/[\s\u00A0]/g, '');
    if (/[.,]\d{2}$/.test(n)) n = n.replace(/[.,]\d{2}$/, '');
    n = n.replace(/[.]/g, '');
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0 || v >= 1000000) return null;
    return v;
  }

  function norm(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function point(quotes) {
    if (!quotes.length) return { status: 'absent', quotes: [] };
    return { status: 'quoted', quotes };
  }

  function listingPoint(text, listing) {
    const src = listing && typeof listing === 'object' ? listing : {};
    const price = src.price == null || src.price === '' ? null : Number(String(src.price).replace(',', '.'));
    const city = String(src.city || '').trim();
    const address = String(src.address || '').trim();
    const attached = (Number.isFinite(price) && price > 0) || city || address;
    if (!attached) return { status: 'no_listing', conflicts: [], unchecked: [] };

    const conflicts = [];
    const unchecked = [];
    const sents = sentences(text);

    if (Number.isFinite(price) && price > 0) {
      const rentSent = sents.find((s) => /huurprijs|kale huur|maandhuur|huur per maand|monthly rent|rent per month/i.test(s) && parseEuro(s) != null);
      if (!rentSent) unchecked.push('price');
      else {
        const found = parseEuro(rentSent);
        if (found != null && found !== price) {
          conflicts.push({ field: 'price', listing: String(price), quote: rentSent });
        }
      }
    }

    if (city) {
      const labeled = sents.find((s) => /(?:plaats|gemeente|city|cidade|ciudad|miasto|oras|citta)\s*[:\-]/i.test(s));
      if (!labeled) unchecked.push('city');
      else {
        const m = labeled.match(/(?:plaats|gemeente|city|cidade|ciudad|miasto|oras|citta)\s*[:\-]\s*([^\n,.]{2,40})/i);
        const got = m ? m[1].trim() : '';
        if (got && norm(got) !== norm(city)) conflicts.push({ field: 'city', listing: city, quote: labeled });
      }
    }

    if (address) {
      const labeled = sents.find((s) => /(?:adres|address|indirizzo|endereco|dirección|adresa)\s*[:\-]/i.test(s));
      if (text.toLowerCase().includes(address.toLowerCase())) {
        /* written the same — not a mismatch */
      } else if (!labeled) unchecked.push('address');
      else {
        const m = labeled.match(/(?:adres|address|indirizzo|endereco|dirección|adresa)\s*[:\-]\s*([^\n]{2,80})/i);
        const got = m ? m[1].trim() : '';
        if (got && norm(got) !== norm(address)) conflicts.push({ field: 'address', listing: address, quote: labeled });
        else if (!got) unchecked.push('address');
      }
    }

    return {
      status: conflicts.length ? 'conflicts' : 'no_conflict',
      conflicts,
      unchecked,
    };
  }

  async function readContract(input, listing) {
    const extracted = await extractPdfText(input);
    if (!extracted.ok) {
      return { readable: false, reason: extracted.reason, points: null };
    }
    const text = extracted.text;
    const term = point(pick(text, /huurperiode|ingangsdatum|einddatum|bepaalde tijd|onbepaalde tijd|duur van de huur|looptijd|lease term|tenancy|start date|end date|fecha de inicio|okres najmu|prazo|durata|scadenza|inizio/i, 2));
    const deposit = point(pick(text, /waarborgsom|waarborg|borg\b|deposit|depósito|deposito|kaucj|cauç|garantie/i, 2));
    const included = point(pick(text, /inclusief|exclusief|servicekosten|kale huur|gemeubileerd|gestoffeerd|included|utilities|incluido|incluso|wliczone|inclus|включен/i, 2));
    const indexation = point(pick(text, /indexering|indexatie|geïndexeerd|geindexeerd|\bCPI\b|huurverhoging|indexed|indexation|indexação|indexacion|indeksac|indicizzazione/i, 2));
    for (const p of [term, deposit, included, indexation]) {
      for (const q of p.quotes) {
        if (!text.includes(q)) return { readable: false, reason: 'unreadable', points: null };
      }
    }
    const listingResult = listingPoint(text, listing);
    for (const c of listingResult.conflicts || []) {
      if (!text.includes(c.quote)) return { readable: false, reason: 'unreadable', points: null };
    }
    return {
      readable: true,
      reason: 'ok',
      points: { term, deposit, included, indexation, listing: listingResult },
    };
  }

  return { extractPdfText, readContract, parseEuro, MAX_BYTES };
});
