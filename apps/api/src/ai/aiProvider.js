/**
 * The interface every AI provider implements. Application code talks to this shape and never
 * to Gemini directly, so tests can swap in fakeProvider.js and the model vendor can change.
 *
 * extractDocument({ documentType, text, file }) -> Promise<{ raw, model }>
 *   documentType: 'commercial_invoice' | 'packing_list' | 'certificate_of_origin'
 *   text:         document text when we could read it, otherwise null
 *   file:         { bytes: Buffer, mimeType: string } sent ONLY when text is null
 *   raw:          the model's parsed JSON. It is UNVALIDATED: the caller must run it through
 *                 the zod parser and evidence check before trusting it.
 *   model:        model name, stored with the result for reproducibility
 *   Throws AiError (see aiError.js) with a safe message.
 *
 * Future (not implemented yet, each needs its own prompt and schema, never shared with extraction):
 *   suggestHsCode(...)      spec 03
 *   explainDiscrepancy(...) spec 04
 */
export const AI_PROVIDER_METHODS = Object.freeze(['extractDocument']);

/** Throws if `provider` does not have the methods the app needs. */
export function assertProvider(provider) {
  for (const m of AI_PROVIDER_METHODS) {
    if (typeof provider?.[m] !== 'function') throw new Error(`AI provider is missing ${m}()`);
  }
  return provider;
}
