// Needs zod, so it runs on a machine with node_modules (not in the offline sandbox).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExtraction, SCHEMA_VERSION } from '../../src/ai/schemas/extraction.js';
import { emptyExtraction } from '../../src/ai/fakeProvider.js';
import { DOCUMENT_FIELDS } from '../../src/ai/fieldNames.js';
import { field } from '../helpers/plainParser.js';

test('every document type accepts an all-missing payload and adds version and type', () => {
  for (const type of Object.keys(DOCUMENT_FIELDS)) {
    const out = parseExtraction(type, emptyExtraction(type));
    assert.equal(out.schema_version, SCHEMA_VERSION);
    assert.equal(out.document_type, type);
  }
});

test('accepts a filled invoice with lines', () => {
  const raw = emptyExtraction('commercial_invoice');
  raw.fields.invoice_number = field('INV-1');
  raw.lines = [
    Object.fromEntries(DOCUMENT_FIELDS.commercial_invoice.lineFields.map((n) => [n, field('x')])),
  ];
  assert.equal(parseExtraction('commercial_invoice', raw).lines.length, 1);
});

test('rejects unknown keys at every level', () => {
  const top = { ...emptyExtraction('packing_list'), extra: 1 };
  assert.throws(() => parseExtraction('packing_list', top), { kind: 'bad_output' });
  const inner = emptyExtraction('packing_list');
  inner.fields.invoice_number = { ...field('x'), note: 'hi' };
  assert.throws(() => parseExtraction('packing_list', inner), { kind: 'bad_output' });
  const unknownField = emptyExtraction('packing_list');
  unknownField.fields.password = field('x');
  assert.throws(() => parseExtraction('packing_list', unknownField), { kind: 'bad_output' });
});

test('rejects missing status with a value', () => {
  const raw = emptyExtraction('commercial_invoice');
  raw.fields.exporter = { value: 'X', confidence: 0, status: 'missing', evidence: null };
  assert.throws(() => parseExtraction('commercial_invoice', raw), { kind: 'bad_output' });
});

test('rejects bad confidence, bad status and unknown document type', () => {
  const raw = emptyExtraction('commercial_invoice');
  raw.fields.exporter = field('X', 'X', { confidence: 1.5 });
  assert.throws(() => parseExtraction('commercial_invoice', raw), { kind: 'bad_output' });
  raw.fields.exporter = field('X', 'X', { status: 'maybe' });
  assert.throws(() => parseExtraction('commercial_invoice', raw), { kind: 'bad_output' });
  assert.throws(() => parseExtraction('bill_of_lading', {}), { kind: 'bad_output' });
});

test('error messages do not echo document values', () => {
  const raw = emptyExtraction('commercial_invoice');
  raw.fields.exporter = field('TOP-SECRET-VALUE', 'q', { confidence: 5 });
  assert.throws(
    () => parseExtraction('commercial_invoice', raw),
    (e) => !e.message.includes('TOP-SECRET-VALUE'),
  );
});

test('accepts an invoice with total_gross_weight and total_net_weight', () => {
  const raw = emptyExtraction('commercial_invoice');
  raw.fields.total_gross_weight = field('500 kg');
  raw.fields.total_net_weight = field('450 kg');
  const out = parseExtraction('commercial_invoice', raw);
  assert.equal(out.fields.total_gross_weight.value, '500 kg');
});

test('accepts an older invoice payload without the optional total weights', () => {
  const raw = emptyExtraction('commercial_invoice');
  delete raw.fields.total_gross_weight;
  delete raw.fields.total_net_weight;
  assert.ok(parseExtraction('commercial_invoice', raw));
});

test('still rejects an unknown invoice key and names it in the error', () => {
  const raw = emptyExtraction('commercial_invoice');
  raw.fields.total_volume = field('3 m3');
  assert.throws(() => parseExtraction('commercial_invoice', raw), {
    kind: 'bad_output',
    message: /fields: unrecognized_keys \(total_volume\)/,
  });
});
