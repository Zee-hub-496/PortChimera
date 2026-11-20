import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { extractPdfText, looksReadable } from '../../src/ai/pdfText.js';
import {
  buildFixtures,
  buildPdf,
  INVOICE_LINES,
  INJECTION_PHRASE,
} from '../../../../scripts/generate-document-fixtures.mjs';

const fx = buildFixtures();

test('extracts every line of the clean invoice fixture', () => {
  const text = extractPdfText(fx['commercial-invoice.pdf']);
  for (const line of INVOICE_LINES) assert.ok(text.includes(line), line);
});

test('reads packing list, certificate and injection fixtures', () => {
  assert.match(extractPdfText(fx['packing-list.pdf']), /Total Gross Weight: 220 kg/);
  assert.match(extractPdfText(fx['certificate-of-origin.pdf']), /CERTIFICATE OF ORIGIN/);
  assert.ok(extractPdfText(fx['injection-invoice.pdf']).includes(INJECTION_PHRASE));
});

test('missing-number invoice has no invoice number line', () => {
  assert.ok(!/Invoice No/.test(extractPdfText(fx['invoice-missing-number.pdf'])));
});

test('reads a Flate-compressed variant', () => {
  const text = extractPdfText(buildPdf(INVOICE_LINES, { compress: true }));
  assert.ok(text.includes('Invoice No: INV-2025-0042'));
});

test('unescapes parentheses and backslashes', () => {
  const pdf = buildPdf(['Goods (cotton) A\\B and some more padding text']);
  assert.ok(extractPdfText(pdf).includes('Goods (cotton) A\\B'));
});

test('reads TJ arrays', () => {
  const content = '[(Hello ) -20 (World of invoices)] TJ';
  const raw = `%PDF-1.4\n1 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n%%EOF`;
  assert.equal(extractPdfText(Buffer.from(raw)), 'Hello World of invoices');
});

test('returns empty string for unusable input', () => {
  assert.equal(extractPdfText(fx['tiny.png']), '');
  assert.equal(extractPdfText(fx['fake-invoice.pdf']), '');
  assert.equal(extractPdfText(Buffer.alloc(0)), '');
  assert.equal(extractPdfText('not a buffer'), '');
  assert.equal(extractPdfText(buildPdf(['short'])), '');
  const broken = Buffer.from(
    `%PDF-1.4\n<< /Filter /FlateDecode >>\nstream\n${'x'.repeat(40)}\nendstream`,
  );
  assert.equal(extractPdfText(broken), '');
  assert.equal(
    extractPdfText(Buffer.concat([Buffer.from('%PDF-1.4\nstream\n'), deflateSync('x')])),
    '',
  );
});

test('looksReadable accepts real invoice text and rejects short or garbled text', () => {
  assert.equal(looksReadable(extractPdfText(fx['commercial-invoice.pdf'])), true);
  assert.equal(looksReadable('Invoice No: INV-1\nTotal: 4,500.00 EUR'), true);
  assert.equal(looksReadable('tiny'), false);
  assert.equal(looksReadable(''), false);
  assert.equal(looksReadable(null), false);
  assert.equal(looksReadable('#@$%^&*{}|~`<>!!!???=== ### $$$ %%% ^^^ &&&'), false);
  assert.equal(
    looksReadable(
      '\u0001\u0002\u0003\u0004\u0005\u0006 abc \u0007\u0008\u0009\u000b\u000c\u000e\u000f\u0010',
    ),
    false,
  );
});
