import { verifyEvidence } from '../../ai/evidence.js';
import { looksReadable } from '../../ai/pdfText.js';

/**
 * Runs one extraction: call the provider, validate, check evidence.
 *
 * - The file is ALWAYS sent to the model inline, so a bad text layer never hides the real page.
 * - If the extracted text looks readable, it is also given to the model as a hint and the
 *   evidence quotes are checked against it. Otherwise no text is sent and evidence_verified is
 *   null ("not verifiable").
 * - `parse(documentType, raw)` is injected (the zod parser in production). It must throw on bad
 *   output. Bad output is rejected, never repaired.
 *
 * @returns {Promise<{payload: object, model: string, evidenceCheck: 'checked'|'not_verifiable'}>}
 * @throws whatever the provider or parser throws (AiError)
 */
export async function runExtraction({ provider, parse, documentType, bytes, mime, text }) {
  const hasText = looksReadable(text);
  const { raw, model } = await provider.extractDocument({
    documentType,
    text: hasText ? text : null,
    file: { bytes, mimeType: mime },
  });
  const parsed = parse(documentType, raw);
  const payload = verifyEvidence(parsed, hasText ? text : null);
  return { payload, model, evidenceCheck: hasText ? 'checked' : 'not_verifiable' };
}
