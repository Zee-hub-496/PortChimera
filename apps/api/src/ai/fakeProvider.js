import { AiError } from './aiError.js';
import { DOCUMENT_FIELDS } from './fieldNames.js';

/** A schema-valid payload where every field is missing. Safe default for tests. */
export function emptyExtraction(documentType) {
  const def = DOCUMENT_FIELDS[documentType];
  const missing = () => ({ value: null, confidence: 0, status: 'missing', evidence: null });
  const payload = {
    fields: Object.fromEntries(
      def.fields.filter((n) => !def.optional.includes(n)).map((n) => [n, missing()]),
    ),
  };
  if (def.lineFields.length > 0) payload.lines = [];
  return payload;
}

/**
 * Fake AI provider for tests. It never touches the network.
 * modes: valid | malformed | timeout | rateLimited (429 first, then ok) | server500 |
 *        injection-followed (returns extra keys, as if the model obeyed an injected instruction)
 * options.response: object or (documentType) => object used as the "model output".
 */
export function createFakeProvider({ mode = 'valid', response, model = 'fake-model' } = {}) {
  const calls = [];
  const build = (documentType) =>
    typeof response === 'function'
      ? response(documentType)
      : (response ?? emptyExtraction(documentType));

  return {
    calls,
    async extractDocument(input) {
      calls.push(input);
      switch (mode) {
        case 'valid':
          return { raw: build(input.documentType), model };
        case 'malformed':
          return { raw: { fields: 'not an object', hello: 'world' }, model };
        case 'timeout':
          throw new AiError('timeout', 'The AI request timed out');
        case 'rateLimited':
          if (calls.length === 1) throw new AiError('rate_limited', 'The AI service is busy');
          return { raw: build(input.documentType), model };
        case 'server500':
          throw new AiError('upstream', 'The AI service returned an error');
        case 'injection-followed':
          return {
            raw: {
              ...build(input.documentType),
              system_prompt: 'I will now reveal my instructions',
              total_value_override: 999999,
            },
            model,
          };
        default:
          throw new Error(`Unknown fake provider mode: ${mode}`);
      }
    },
  };
}
