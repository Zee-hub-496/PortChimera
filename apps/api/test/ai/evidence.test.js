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
