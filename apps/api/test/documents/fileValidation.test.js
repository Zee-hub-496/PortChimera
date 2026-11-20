import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  detectFileType,
  validateUpload,
  buildStoragePath,
  sanitizeFilename,
} from '../../src/modules/documents/fileValidation.js';
import { buildFixtures } from '../../../../scripts/generate-document-fixtures.mjs';

const fx = buildFixtures();
const rejects = (fn, status, code) =>
  assert.throws(fn, (e) => e.name === 'AppError' && e.status === status && e.code === code);

test('detects pdf, jpeg and png by magic bytes', () => {
  assert.equal(detectFileType(fx['commercial-invoice.pdf']), 'application/pdf');
  assert.equal(detectFileType(fx['tiny.png']), 'image/png');
  assert.equal(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), 'image/jpeg');
});

test('detectFileType returns null for unknown, empty and non-buffer input', () => {
  assert.equal(detectFileType(fx['fake-invoice.pdf']), null);
  assert.equal(detectFileType(Buffer.alloc(0)), null);
  assert.equal(detectFileType('%PDF-'), null);
  assert.equal(detectFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47])), null);
});

test('validateUpload returns mime, sha256 and size', () => {
  const buffer = fx['commercial-invoice.pdf'];
  const out = validateUpload({ buffer, documentType: 'commercial_invoice' });
  assert.equal(out.mime, 'application/pdf');
  assert.equal(out.size, buffer.length);
  assert.equal(out.sha256, createHash('sha256').update(buffer).digest('hex'));
});

test('EXE bytes named .pdf are rejected by content', () => {
  rejects(
    () => validateUpload({ buffer: fx['fake-invoice.pdf'], documentType: 'commercial_invoice' }),
    400,
    'UNSUPPORTED_FILE_TYPE',
  );
});

test('empty file is rejected', () => {
  rejects(
    () => validateUpload({ buffer: Buffer.alloc(0), documentType: 'packing_list' }),
    400,
    'EMPTY_FILE',
  );
});

test('oversize file is rejected, exact limit is allowed', () => {
  const head = Buffer.from('%PDF-');
  const big = Buffer.concat([head, Buffer.alloc(100)]);
  rejects(
    () => validateUpload({ buffer: big, documentType: 'packing_list', maxBytes: 104 }),
    413,
    'FILE_TOO_LARGE',
  );
  assert.equal(
    validateUpload({ buffer: big, documentType: 'packing_list', maxBytes: 105 }).size,
    105,
  );
  rejects(
    () =>
      validateUpload({
        buffer: Buffer.concat([head, Buffer.alloc(5 * 1024 * 1024)]),
        documentType: 'packing_list',
      }),
    413,
    'FILE_TOO_LARGE',
  );
});

test('unknown document type is rejected', () => {
  for (const documentType of ['bill_of_lading', '', undefined]) {
    rejects(
      () => validateUpload({ buffer: fx['tiny.png'], documentType }),
      400,
      'INVALID_DOCUMENT_TYPE',
    );
  }
});

test('storage path uses only ids and a uuid, never the file name', () => {
  const name = sanitizeFilename('../../x.pdf');
  const path = buildStoragePath('user-1', 'ship-1', 'uuid-1');
  assert.equal(path, 'user-1/ship-1/uuid-1');
  assert.ok(!path.includes('x.pdf'));
  assert.ok(!path.includes('..'));
  assert.ok(name !== null);
  assert.match(buildStoragePath('u', 's'), /^u\/s\/[0-9a-f-]{36}$/);
});

test('sanitizeFilename strips control characters and caps length', () => {
  assert.equal(sanitizeFilename('a\u0000b\nc\u007f.pdf'), 'abc.pdf');
  assert.equal(sanitizeFilename('x'.repeat(500)).length, 200);
  assert.equal(sanitizeFilename('   '), null);
  assert.equal(sanitizeFilename(42), null);
});
