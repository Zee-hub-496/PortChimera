import { createHash, randomUUID } from 'node:crypto';
import { AppError } from '../../middleware/errorHandler.js';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_TYPES = Object.freeze([
  'commercial_invoice',
  'packing_list',
  'certificate_of_origin',
]);

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Decides the file type from its first bytes. The Content-Type header and the file
 * name are NOT used because the client controls both.
 * @returns {'application/pdf'|'image/jpeg'|'image/png'|null}
 */
export function detectFileType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_MAGIC)) return 'image/png';
  return null;
}

/**
 * Checks an uploaded file and returns what we need to store about it.
 * @throws {AppError} 400 INVALID_DOCUMENT_TYPE / EMPTY_FILE / UNSUPPORTED_FILE_TYPE, 413 FILE_TOO_LARGE
 */
export function validateUpload({ buffer, documentType, maxBytes = MAX_UPLOAD_BYTES }) {
  if (!DOCUMENT_TYPES.includes(documentType)) {
    throw new AppError(
      400,
      'INVALID_DOCUMENT_TYPE',
      `documentType must be one of: ${DOCUMENT_TYPES.join(', ')}`,
    );
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new AppError(400, 'EMPTY_FILE', 'The uploaded file is empty');
  }
  if (buffer.length > maxBytes) {
    throw new AppError(413, 'FILE_TOO_LARGE', `File is larger than ${maxBytes} bytes`);
  }
  const mime = detectFileType(buffer);
  if (!mime) {
    throw new AppError(400, 'UNSUPPORTED_FILE_TYPE', 'Only PDF, JPEG and PNG files are accepted');
  }
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  return { mime, sha256, size: buffer.length };
}

/** Storage path built only from ids and a random uuid. The user's file name is never part of it. */
export function buildStoragePath(userId, shipmentId, uuid = randomUUID()) {
  return `${userId}/${shipmentId}/${uuid}`;
}

/** Cleans a client file name for DISPLAY only: no control characters, at most 200 characters. */
export function sanitizeFilename(name) {
  if (typeof name !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return cleaned ? cleaned.slice(0, 200) : null;
}
