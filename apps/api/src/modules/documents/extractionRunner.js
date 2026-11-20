import { verifyEvidence } from '../../ai/evidence.js';

const MIN_TEXT_CHARS = 20;

/**
 * Runs one extraction: choose text or file, call the provider, validate, check evidence.
 *
 * - If readable text exists, ONLY the text goes to the model and evidence is checked against it.
 * - Otherwise the file goes to the model inline and evidence_verified is null ("not verifiable").
 * - `parse(documentType, raw)` is injected (the zod parser in production). It must throw on bad
 *   output. Bad output is rejected, never repaired.
 *
 * @returns {Promise<{payload: object, model: string, evidenceCheck: 'checked'|'not_verifiable'}>}
 * @throws whatever the provider or parser throws (AiError)
 */
export async function runExtraction({ provider, parse, documentType, bytes, mime, text }) {
  const hasText = typeof text === 'string' && text.trim().length >= MIN_TEXT_CHARS;
  const { raw, model } = await provider.extractDocument({
    documentType,
    text: hasText ? text : null,
    file: hasText ? undefined : { bytes, mimeType: mime },
  });
  const parsed = parse(documentType, raw);
  const payload = verifyEvidence(parsed, hasText ? text : null);
  return { payload, model, evidenceCheck: hasText ? 'checked' : 'not_verifiable' };
}
