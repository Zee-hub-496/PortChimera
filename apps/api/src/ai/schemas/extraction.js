import { z } from 'zod';
import { AiError } from '../aiError.js';
import { DOCUMENT_FIELDS, FIELD_STATUSES, SCHEMA_VERSION } from '../fieldNames.js';

export { SCHEMA_VERSION };

/** One extracted value with the model's confidence and a quote from the document. */
export const fieldSchema = z
  .object({
    value: z.union([z.string(), z.number(), z.null()]),
    confidence: z.number().min(0).max(1),
    status: z.enum(FIELD_STATUSES),
    evidence: z.string().nullable(),
  })
  .strict()
  .refine((f) => f.status !== 'missing' || f.value === null, {
    message: 'A missing field must have value null',
    path: ['value'],
  });

function shapeFor(names, optional = []) {
  return Object.fromEntries(
    names.map((n) => [n, optional.includes(n) ? fieldSchema.optional() : fieldSchema]),
  );
}

function buildSchema(type) {
  const def = DOCUMENT_FIELDS[type];
  const shape = {
    fields: z.object(shapeFor(def.fields, def.optional)).strict(),
  };
  if (def.lineFields.length > 0) {
    shape.lines = z.array(z.object(shapeFor(def.lineFields)).strict());
  }
  return z.object(shape).strict();
}

export const extractionSchemas = Object.freeze(
  Object.fromEntries(Object.keys(DOCUMENT_FIELDS).map((t) => [t, buildSchema(t)])),
);

/**
 * Validates raw model output. Rejects, never repairs.
 * @throws {AiError} kind bad_output
 */
export function parseExtraction(documentType, raw) {
  const schema = extractionSchemas[documentType];
  if (!schema) throw new AiError('bad_output', 'Unknown document type');
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path?.join('.') || 'root';
    throw new AiError('bad_output', `Model output failed validation at ${where}`);
  }
  return { schema_version: SCHEMA_VERSION, document_type: documentType, ...result.data };
}
