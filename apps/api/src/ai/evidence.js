/** Lowercase and collapse all whitespace so line breaks and spacing do not matter. */
export function normalize(s) {
  return String(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

function verifyField(field, haystack) {
  if (!field || typeof field !== 'object' || field.status === 'missing') return field;
  if (haystack === null) return { ...field, evidence_verified: null };
  const quote = typeof field.evidence === 'string' ? normalize(field.evidence) : '';
  if (quote !== '' && haystack.includes(quote)) return { ...field, evidence_verified: true };
  return {
    ...field,
    evidence_verified: false,
    status: field.status === 'extracted' ? 'uncertain' : field.status,
    confidence: Math.min(field.confidence ?? 0, 0.3),
  };
}

/**
 * Checks every field's evidence quote against the document text and returns a new payload.
 * evidence_verified: true (quote found), false (not found: extracted becomes uncertain and
 * confidence drops), null (no text to check against, for example an image).
 * Fields with status "missing" are left alone.
 */
export function verifyEvidence(payload, text) {
  const haystack = typeof text === 'string' && text.trim() !== '' ? normalize(text) : null;
  const fields = Object.fromEntries(
    Object.entries(payload.fields ?? {}).map(([k, f]) => [k, verifyField(f, haystack)]),
  );
  const out = { ...payload, fields };
  if (Array.isArray(payload.lines)) {
    out.lines = payload.lines.map((line) =>
      Object.fromEntries(Object.entries(line).map(([k, f]) => [k, verifyField(f, haystack)])),
    );
  }
  return out;
}
