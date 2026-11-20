import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AppError } from '../../middleware/errorHandler.js';
import { makeParser } from '../shipments/schemas.js';
import { createGeminiProvider } from '../../ai/geminiProvider.js';
import { MAX_UPLOAD_BYTES } from './fileValidation.js';
import { documentHandlers } from './handlers.js';
import { documentTypeSchema, makeReviewParser, parseExtraction, uuidSchema } from './schemas.js';

/** Stricter limit for the expensive routes (upload and AI processing). */
function strictLimiter() {
  return rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down' } },
  });
}

/**
 * Reads the raw file bytes. Only the three file types are read; anything else (including JSON)
 * is left alone and the handler answers 415. The 5 MB cap maps to our FILE_TOO_LARGE error.
 */
function rawUpload() {
  const raw = express.raw({
    type: ['application/pdf', 'image/jpeg', 'image/png'],
    limit: MAX_UPLOAD_BYTES,
  });
  return (req, res, next) =>
    raw(req, res, (err) => {
      if (err?.type === 'entity.too.large') {
        return next(new AppError(413, 'FILE_TOO_LARGE', 'File is larger than 5 MB'));
      }
      return next(err);
    });
}

function buildHandlers({ env, logger }) {
  let provider = null;
  return documentHandlers({
    parseId: makeParser(uuidSchema, AppError),
    parseType: makeParser(documentTypeSchema, AppError),
    parseReview: makeReviewParser(AppError),
    parseExtraction,
    // Built lazily so a missing key never stops the server from starting.
    getProvider: () => {
      if (!env?.GEMINI_API_KEY || !env?.GEMINI_MODEL) return null;
      provider ??= createGeminiProvider({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL });
      return provider;
    },
    logger,
  });
}

/** Routes under /api/shipments/:shipmentId/documents (upload and list). */
export function shipmentDocumentsRouter({ env, logger = console } = {}) {
  const h = buildHandlers({ env, logger });
  const router = Router({ mergeParams: true });
  router.post('/', strictLimiter(), rawUpload(), h.upload);
  router.get('/', h.list);
  return router;
}

/** Routes under /api/documents. */
export function documentsRouter({ env, logger = console } = {}) {
  const h = buildHandlers({ env, logger });
  const router = Router();
  router.get('/:id', h.get);
  router.get('/:id/download', h.download);
  router.post('/:id/process', strictLimiter(), h.process);
  router.put('/:id/review', h.review);
  return router;
}
