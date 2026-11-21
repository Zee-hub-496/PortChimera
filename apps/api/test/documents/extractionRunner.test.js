import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runExtraction } from '../../src/modules/documents/extractionRunner.js';
import { createFakeProvider, emptyExtraction } from '../../src/ai/fakeProvider.js';
import { extractPdfText } from '../../src/ai/pdfText.js';
import { assertProvider } from '../../src/ai/aiProvider.js';
import { SCHEMA_VERSION } from '../../src/ai/fieldNames.js';
import { plainParse, field, missing } from '../helpers/plainParser.js';
import {
  buildFixtures,
  INJECTION_PHRASE,
} from '../../../../scripts/generate-document-fixtures.mjs';

const fx = buildFixtures();
const invoiceText = extractPdfText(fx['commercial-invoice.pdf']);

function invoiceResponse() {
  const r = emptyExtraction('commercial_invoice');
  r.fields.invoice_number = field('INV-2025-0042', 'Invoice No: INV-2025-0042');
  r.fields.exporter = field('Example Textiles Ltd', 'Exporter: Example Textiles Ltd');
  r.fields.total_value = field('4500.00', 'Total Value: 9999 EUR');
  return r;
}
const base = (provider, extra = {}) => ({
  provider,
  parse: plainParse,
  documentType: 'commercial_invoice',
  bytes: fx['commercial-invoice.pdf'],
  mime: 'application/pdf',
  text: invoiceText,
  ...extra,
});

test('fake provider satisfies the provider interface', () => {
  assertProvider(createFakeProvider());
  assert.throws(() => assertProvider({}));
});

test('valid output with readable text: file and text sent, evidence checked', async () => {
  const provider = createFakeProvider({ response: invoiceResponse() });
  const out = await runExtraction(base(provider));
  assert.equal(out.evidenceCheck, 'checked');
  assert.equal(out.model, 'fake-model');
  assert.deepEqual(provider.calls[0].file, {
    bytes: fx['commercial-invoice.pdf'],
    mimeType: 'application/pdf',
  });
  assert.equal(provider.calls[0].text, invoiceText);
  assert.equal(out.payload.schema_version, SCHEMA_VERSION);
  assert.equal(out.payload.fields.invoice_number.evidence_verified, true);
  assert.equal(out.payload.fields.total_value.evidence_verified, false);
  assert.equal(out.payload.fields.total_value.status, 'uncertain');
  assert.equal(out.payload.fields.currency.status, 'missing');
});

test('no text: file sent inline and evidence is not verifiable', async () => {
  const provider = createFakeProvider({ response: invoiceResponse() });
  const png = fx['tiny.png'];
  const out = await runExtraction(base(provider, { text: '', bytes: png, mime: 'image/png' }));
  assert.equal(out.evidenceCheck, 'not_verifiable');
  assert.equal(provider.calls[0].text, null);
  assert.deepEqual(provider.calls[0].file, { bytes: png, mimeType: 'image/png' });
  assert.equal(out.payload.fields.invoice_number.evidence_verified, null);
  assert.equal(out.payload.fields.invoice_number.status, 'extracted');
});

test('too little text counts as no text', async () => {
  const provider = createFakeProvider();
  const out = await runExtraction(base(provider, { text: 'tiny' }));
  assert.equal(out.evidenceCheck, 'not_verifiable');
  assert.ok(provider.calls[0].file);
});

test('gibberish text: file still sent, text withheld, evidence not verifiable', async () => {
  const provider = createFakeProvider({ response: invoiceResponse() });
  const gibberish = '\u0001\u0002#@$%^&*{}|~`<>\u0003\u0004 \u00ff\u00fe!!!???=== ###';
  const out = await runExtraction(base(provider, { text: gibberish }));
  assert.equal(out.evidenceCheck, 'not_verifiable');
  assert.equal(provider.calls[0].text, null);
  assert.ok(provider.calls[0].file.bytes);
  assert.equal(out.payload.fields.invoice_number.evidence_verified, null);
  assert.equal(out.payload.fields.invoice_number.status, 'extracted');
});

test('malformed output is rejected, not repaired', async () => {
  const provider = createFakeProvider({ mode: 'malformed' });
  await assert.rejects(runExtraction(base(provider)), { kind: 'bad_output' });
});

test('provider failures propagate (timeout, 500, rate limit)', async () => {
  await assert.rejects(runExtraction(base(createFakeProvider({ mode: 'timeout' }))), {
    kind: 'timeout',
  });
  await assert.rejects(runExtraction(base(createFakeProvider({ mode: 'server500' }))), {
    kind: 'upstream',
  });
  const limited = createFakeProvider({ mode: 'rateLimited' });
  await assert.rejects(runExtraction(base(limited)), { kind: 'rate_limited' });
  assert.equal((await runExtraction(base(limited))).payload.document_type, 'commercial_invoice');
});

test('a model that obeyed an injected instruction is rejected by the schema', async () => {
  const provider = createFakeProvider({ mode: 'injection-followed', response: invoiceResponse() });
  await assert.rejects(runExtraction(base(provider)), { kind: 'bad_output' });
});

test('injection fixture: text reaches the model only as data, output stays valid', async () => {
  const text = extractPdfText(fx['injection-invoice.pdf']);
  assert.ok(text.includes(INJECTION_PHRASE));
  const r = invoiceResponse();
  r.fields.total_value = field('4500.00', 'Total Value: 4500.00 EUR');
  const provider = createFakeProvider({ response: r });
  const out = await runExtraction(base(provider, { text }));
  assert.equal(out.payload.fields.total_value.value, '4500.00');
  const values =
    JSON.stringify(out.payload.fields.exporter) + JSON.stringify(out.payload.fields.total_value);
  assert.ok(!values.includes('999999'));
  assert.ok(!JSON.stringify(out.payload).includes('system prompt'));
});

test('packing list and certificate types run through the same path', async () => {
  for (const documentType of ['packing_list', 'certificate_of_origin']) {
    const provider = createFakeProvider();
    const out = await runExtraction(base(provider, { documentType, text: '' }));
    assert.equal(out.payload.document_type, documentType);
  }
  assert.equal(missing().status, 'missing');
});
