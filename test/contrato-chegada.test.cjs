'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const contract = require('../dist/ww-contract.js');

function pdfEscape(s) {
  return '(' + String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')';
}

function makePdf(lines, opts = {}) {
  const flate = opts.flate !== false;
  const content = 'BT /F1 12 Tf\n' + lines.map((line) => pdfEscape(line) + ' Tj T*').join('\n') + '\nET';
  const stream = flate ? zlib.deflateSync(Buffer.from(content, 'latin1')) : Buffer.from(content, 'latin1');
  const header = Buffer.from('%PDF-1.4\n');
  const o1 = Buffer.from('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  const o2 = Buffer.from('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  let page = '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 4 0 R';
  if (opts.encrypt) page += ' /Encrypt 9 0 R';
  page += ' >>\nendobj\n';
  const o3 = Buffer.from(page);
  const dict = Buffer.from('4 0 obj\n<< /Length ' + stream.length + (flate ? ' /Filter /FlateDecode' : '') + ' >>\nstream\n');
  const tail = Buffer.from('\nendstream\nendobj\n');
  const parts = [header, o1, o2, o3, dict, stream, tail];
  const offsets = [];
  let pos = 0;
  for (const part of parts) {
    if (part === o1 || part === o2 || part === o3 || part === dict) offsets.push(pos);
    pos += part.length;
  }
  let xref = 'xref\n0 5\n0000000000 65535 f \n';
  for (const off of offsets) xref += String(off).padStart(10, '0') + ' 00000 n \n';
  const startxref = pos;
  const trailer = Buffer.from(xref + 'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n' + startxref + '\n%%EOF\n');
  return Buffer.concat([...parts, trailer]);
}

const SAMPLE = [
  'Huurperiode: 1 september 2026 tot 31 augustus 2027.',
  'Waarborgsom: EUR 1500.',
  'De huurprijs is inclusief gas, water en elektra.',
  'De huur wordt jaarlijks geindexeerd volgens CPI.',
  'Huurprijs EUR 1800 per maand.',
  'Plaats: Rotterdam.',
];

function quotesOf(result) {
  const p = result.points;
  return [...p.term.quotes, ...p.deposit.quotes, ...p.included.quotes, ...p.indexation.quotes, ...(p.listing.conflicts || []).map((c) => c.quote)];
}

describe('readContract', () => {
  it('quotes only text that is in a FlateDecode PDF', async () => {
    const result = await contract.readContract(makePdf(SAMPLE), { price: 1200, city: 'Amsterdam' });
    assert.equal(result.readable, true);
    assert.equal(result.points.term.status, 'quoted');
    assert.equal(result.points.deposit.status, 'quoted');
    assert.equal(result.points.included.status, 'quoted');
    assert.equal(result.points.indexation.status, 'quoted');
    assert.equal(result.points.listing.status, 'conflicts');
    const fields = result.points.listing.conflicts.map((c) => c.field).sort();
    assert.deepEqual(fields, ['city', 'price']);
    const text = (await contract.extractPdfText(makePdf(SAMPLE))).text;
    for (const q of quotesOf(result)) assert.ok(text.includes(q), q);
    assert.equal(contract.parseEuro('Huurprijs EUR 1800 per maand.'), 1800);
    assert.equal(contract.parseEuro('Waarborgsom: EUR 1.500.'), 1500);
  });

  it('reads an uncompressed content stream', async () => {
    const result = await contract.readContract(makePdf(SAMPLE, { flate: false }), null);
    assert.equal(result.readable, true);
    assert.match(result.points.deposit.quotes[0], /Waarborgsom/);
    assert.equal(result.points.listing.status, 'no_listing');
  });

  it('does not invent a deposit or a price when the PDF has neither', async () => {
    const result = await contract.readContract(makePdf(['De kat zit op de mat.']), { price: 900 });
    assert.equal(result.readable, true);
    assert.equal(result.points.deposit.status, 'absent');
    assert.deepEqual(result.points.deposit.quotes, []);
    assert.equal(result.points.term.status, 'absent');
    assert.equal(result.points.listing.status, 'no_conflict');
    assert.ok(result.points.listing.unchecked.includes('price'));
    assert.equal(result.points.listing.conflicts.length, 0);
  });

  it('fails closed on a non-PDF and on an encrypted PDF', async () => {
    const junk = await contract.readContract(Buffer.from('not a contract'));
    assert.equal(junk.readable, false);
    assert.equal(junk.reason, 'not_pdf');
    assert.equal(junk.points, null);
    const locked = await contract.readContract(makePdf(SAMPLE, { encrypt: true }));
    assert.equal(locked.readable, false);
    assert.equal(locked.points, null);
  });

  it('fails closed when the PDF has no text operators', async () => {
    const empty = makePdf([]);
    const result = await contract.readContract(empty);
    assert.equal(result.readable, false);
    assert.equal(result.points, null);
  });

  it('does not report a price conflict when the amounts match', async () => {
    const result = await contract.readContract(makePdf(SAMPLE), { price: 1800, city: 'Rotterdam' });
    assert.equal(result.points.listing.conflicts.length, 0);
    assert.equal(result.points.listing.status, 'no_conflict');
  });
});

describe('arrival page sources', () => {
  it('keeps the official links and does not name Vorxeo', () => {
    const fs = require('fs');
    const ui = fs.readFileSync(require('path').join(__dirname, '../dist/ww-ui.js'), 'utf8');
    const htmlC = fs.readFileSync(require('path').join(__dirname, '../dist/contrato/index.html'), 'utf8');
    const htmlA = fs.readFileSync(require('path').join(__dirname, '../dist/chegada/index.html'), 'utf8');
    assert.match(ui, /https:\/\/www\.digid\.nl\/aanvragen-en-activeren\/digid-aanvragen/);
    assert.match(ui, /https:\/\/www\.digid\.nl\/en\/apply-and-activate\/apply-digid/);
    assert.match(ui, /https:\/\/www\.rijksoverheid\.nl\/vraag-en-antwoord\/immigratie-naar-nederland\/wat-moet-ik-regelen-als-ik-in-nederland-kom-wonen/);
    assert.match(ui, /https:\/\/www\.rijksoverheid\.nl\/vraag-en-antwoord\/privacy-en-persoonsgegevens\/hoe-kom-ik-aan-een-burgerservicenummer-bsn/);
    assert.match(ui, /https:\/\/www\.rijksoverheid\.nl\/vraag-en-antwoord\/zorgverzekering\/ben-ik-verplicht-een-zorgverzekering-af-te-sluiten/);
    assert.doesNotMatch(ui + htmlC + htmlA, /vorxeo/i);
    assert.match(htmlC, /KvK-nummer 42108778/);
    assert.match(htmlA, /BTW-nummer NL005499683B86/);
    assert.equal(fs.readdirSync(require('path').join(__dirname, '../api')).length <= 12, true);
  });
});
