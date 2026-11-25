import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyEvidence, normalize } from '../../src/ai/evidence.js';
import { field, missing } from '../helpers/plainParser.js';

const TEXT = 'Invoice No:  INV-2025-0042\nExporter: Example Textiles Ltd';

const payload = () => ({
  fields: {
    invoice_number: field('INV-2025-0042', 'Invoice No: INV-2025-0042'),
    exporter: field('Example Textiles Ltd', 'example   TEXTILES ltd'),
    importer: field('Nobody Inc', 'Importer: Nobody Inc'),
    currency: missing(),
  },
  lines: [{ name: field('Hat', 'Hat') }],
});

test('normalize lowercases and collapses whitespace', () => {
  assert.equal(normalize('  A \n\t b  '), 'a b');
});

test('found evidence (whitespace and case ignored) is verified true', () => {
  const out = verifyEvidence(payload(), TEXT);
  assert.equal(out.fields.invoice_number.evidence_verified, true);
  assert.equal(out.fields.exporter.evidence_verified, true);
  assert.equal(out.fields.exporter.status, 'extracted');
});

test('evidence not found downgrades status and confidence', () => {
  const out = verifyEvidence(payload(), TEXT);
  assert.equal(out.fields.importer.evidence_verified, false);
  assert.equal(out.fields.importer.status, 'uncertain');
  assert.ok(out.fields.importer.confidence <= 0.3);
  assert.equal(out.lines[0].name.evidence_verified, false);
});

test('missing fields are left alone', () => {
  const out = verifyEvidence(payload(), TEXT);
  assert.deepEqual(out.fields.currency, missing());
});

test('no text means evidence_verified null and no downgrade', () => {
  for (const text of [null, '', '   ', undefined]) {
    const out = verifyEvidence(payload(), text);
    assert.equal(out.fields.importer.evidence_verified, null);
    assert.equal(out.fields.importer.status, 'extracted');
    assert.equal(out.fields.importer.confidence, 0.9);
  }
});

test('null evidence on an extracted field is unverified', () => {
  const p = { fields: { a: field('x', null) } };
  assert.equal(verifyEvidence(p, TEXT).fields.a.evidence_verified, false);
});

test('does not mutate the input', () => {
  const p = payload();
  verifyEvidence(p, TEXT);
  assert.equal(p.fields.importer.evidence_verified, undefined);
});

// ---- Day 5: the quote must SHOW the value, not just exist in the document -----------------

import { valueSupportedByQuote } from '../../src/ai/evidence.js';

const supportedBy = (value, quote) => verifyEvidence({ fields: { a: field(value, quote) } }, quote);

test('a quote that exists but does not show the value is flagged, not trusted', () => {
  const text = 'Invoice No: INV-2025-0042';
  const out = verifyEvidence(
    { fields: { invoice_number: field('INV-2025-0099', 'Invoice No: INV-2025-0042') } },
    text,
  );
  const f = out.fields.invoice_number;
  assert.equal(f.evidence_verified, 'unsupported_value');
  assert.equal(f.status, 'uncertain');
  assert.ok(f.confidence <= 0.5);
});

test('a number that is not in its quote is flagged', () => {
  const f = supportedBy(650, 'Gross weight: 500 kg').fields.a;
  assert.equal(f.evidence_verified, 'unsupported_value');
  assert.equal(f.status, 'uncertain');
});

test('lines get the same check', () => {
  const text = 'Hat 10 pcs';
  const out = verifyEvidence({ fields: {}, lines: [{ quantity: field(99, 'Hat 10 pcs') }] }, text);
  assert.equal(out.lines[0].quantity.evidence_verified, 'unsupported_value');
});

test('harmless differences between value and quote are still supported', () => {
  const cases = [
    [500, 'Gross weight: 500 kg'],
    [1000, 'Quantity 1,000 pcs'],
    [1234.5, 'Total 1.234,50'],
    [6000, 'Total: USD 6,000.00'],
    ['6000.00', 'Total: 6,000.00'],
    ['Example Textiles Ltd', 'EXAMPLE TEXTILES LTD.'],
    ['Example Textiles Ltd', 'Exporter:  Example\nTextiles Ltd'],
    ['2025-03-14', 'Date: 14 March 2025'],
    ['2025-03-14', 'Invoice date 14/03/2025'],
    ['2025-03-14', 'March 14, 2025'],
    ['USD', 'Currency: US$'],
    ['China', 'Country of origin: P.R. China'],
    ['Germany', 'Made in Deutschland'],
    ['INV-2025-0042', 'Invoice No: INV 2025 0042'],
  ];
  for (const [value, quote] of cases) {
    assert.equal(valueSupportedByQuote(value, quote), true, `${value} / ${quote}`);
    assert.equal(supportedBy(value, quote).fields.a.evidence_verified, true, `${value} / ${quote}`);
  }
});

test('different dates, countries and names are not supported', () => {
  assert.equal(valueSupportedByQuote('2025-03-15', 'Date: 14 March 2025'), false);
  assert.equal(valueSupportedByQuote('2024-03-14', 'Date: 14 March 2025'), false);
  assert.equal(valueSupportedByQuote('France', 'Country of origin: P.R. China'), false);
  assert.equal(valueSupportedByQuote('Other Co', 'Exporter: Example Textiles Ltd'), false);
});

test('nothing to support: an empty value passes, and no text means not checked', () => {
  assert.equal(valueSupportedByQuote(null, 'anything'), true);
  assert.equal(valueSupportedByQuote('', 'anything'), true);
  const out = verifyEvidence({ fields: { a: field(650, 'Gross weight: 500 kg') } }, null);
  assert.equal(out.fields.a.evidence_verified, null);
  assert.equal(out.fields.a.status, 'extracted');
});

test('a quote that is not in the document is still plain "false"', () => {
  const out = verifyEvidence({ fields: { a: field('x', 'never written') } }, 'Invoice No: 1');
  assert.equal(out.fields.a.evidence_verified, false);
});
