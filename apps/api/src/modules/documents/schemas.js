import { z } from 'zod';
import { AiError } from '../../ai/aiError.js';
import { parseExtraction } from '../../ai/schemas/extraction.js';
import { DOCUMENT_TYPES } from './fileValidation.js';

/** Path parameters :id and :shipmentId. */
export const uuidSchema = z.string().uuid();

/** Query parameter ?type=. */
export const documentTypeSchema = z.enum(DOCUMENT_TYPES);

/**
 * Reviewed payloads use the same strict schema as AI output, so a person cannot save
 * unknown keys or a "missing" field that has a value. Throws AppError 422.
 */
export function makeReviewParser(AppError) {
  return (documentType, body) => {
    try {
      return parseExtraction(documentType, body);
    } catch (err) {
      if (err instanceof AiError) {
        throw new AppError(422, 'VALIDATION_ERROR', err.message.replace('Model output', 'Review'));
      }
      throw err;
    }
  };
}

export { parseExtraction };
