import { DOCUMENT_FIELDS, FIELD_STATUSES } from './fieldNames.js';

// Builds the Gemini structured-output schema from DOCUMENT_FIELDS, so the prompt, the zod
// validator and this schema all come from one list. Plain module (no zod).
//
// Choice: generationConfig.responseSchema (an OpenAPI 3.0 subset), not responseJsonSchema.
// Source: googleapis/js-genai src/types.ts. `Schema` supports type, properties, required,
// nullable, enum, items, anyOf, minimum and maximum. responseJsonSchema is the alternative
// that also accepts additionalProperties, but it is the newer path ("not all features are
// supported"), while responseSchema is the documented default. The subset has no
// additionalProperties, so extra keys cannot be forbidden here. The zod schema is still the
// final gate and rejects them. Rejected output is never repaired.

const FIELD_KEYS = ['value', 'confidence', 'status', 'evidence'];

/** Schema of one extracted value: { value, confidence, status, evidence }. */
export function fieldResponseSchema() {
  return {
    type: 'OBJECT',
    properties: {
      value: { nullable: true, anyOf: [{ type: 'STRING' }, { type: 'NUMBER' }] },
      confidence: { type: 'NUMBER', minimum: 0, maximum: 1 },
      status: { type: 'STRING', enum: [...FIELD_STATUSES] },
      evidence: { type: 'STRING', nullable: true },
    },
    required: [...FIELD_KEYS],
    propertyOrdering: [...FIELD_KEYS],
  };
}

function objectOf(names, optional = []) {
  return {
    type: 'OBJECT',
    properties: Object.fromEntries(names.map((n) => [n, fieldResponseSchema()])),
    required: names.filter((n) => !optional.includes(n)),
    propertyOrdering: [...names],
  };
}

/** The responseSchema for one document type. Throws on an unknown type. */
export function buildResponseSchema(documentType) {
  const def = DOCUMENT_FIELDS[documentType];
  if (!def) throw new Error(`Unknown document type: ${documentType}`);
  const properties = { fields: objectOf(def.fields, def.optional) };
  const required = ['fields'];
  if (def.lineFields.length > 0) {
    properties.lines = { type: 'ARRAY', items: objectOf(def.lineFields) };
    required.push('lines');
  }
  return { type: 'OBJECT', properties, required, propertyOrdering: Object.keys(properties) };
}
