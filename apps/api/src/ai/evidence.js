import { normalizeCountry, normalizeCurrency, numberReadings, readDates } from '@portchimera/core';

/** Lowercase and collapse all whitespace so line breaks and spacing do not matter. */
export function normalize(s) {
  return String(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

// Letters and digits only, without accents, so punctuation and spacing never matter.
const alnum = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');

const sameNumber = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

function numberSupported(value, quote) {
  const wanted = typeof value === 'number' ? [value] : numberReadings(String(value));
  if (wanted.length === 0) return false;
  const tokens = quote.match(/\d[\d.,]*/g) ?? [];
  return tokens.some((raw) =>
    numberReadings(raw.replace(/[.,]+$/, '')).some((n) => wanted.some((w) => sameNumber(w, n))),
  );
}

const DATE_SHAPES = [
  /\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/g,
  /\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+,?\s+\d{4}/g,
  /[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}/g,
];

function dateSupported(value, quote) {
  const wanted = readDates(String(value));
  if (wanted.length === 0) return false;
  return DATE_SHAPES.flatMap((re) => quote.match(re) ?? []).some((candidate) =>
    readDates(candidate).some((d) => wanted.includes(d)),
  );
}

function countrySupported(value, quote) {
  const wanted = normalizeCountry(String(value))?.code;
  if (!wanted) return false;
  const words = quote.split(/\s+/).filter(Boolean);
  for (let start = 0; start < words.length; start += 1) {
    for (let end = start + 1; end <= Math.min(words.length, start + 6); end += 1) {
      if (normalizeCountry(words.slice(start, end).join(' '))?.code === wanted) return true;
    }
  }
  return false;
}

function currencySupported(value, quote) {
  if (!/^[A-Za-z]{3}$/.test(String(value).trim())) return false;
  const wanted = normalizeCurrency(String(value));
  return quote
    .split(/\s+/)
    .some((token) => normalizeCurrency(token.replace(/^[^\p{L}$]+|[^\p{L}$]+$/gu, '')) === wanted);
}

/**
 * Does the quote actually SHOW the value? Finding the quote in the document only proves the AI
 * did not invent the quote; the value could still be one the quote does not contain. Formatting
 * is ignored: spacing, punctuation, case, accents, thousands separators, date styles, country and
 * currency spellings. Changed units or a different number are not supported.
 * An empty value has nothing to support.
 */
export function valueSupportedByQuote(value, quote) {
  if (value === null || value === undefined || String(value).trim() === '') return true;
  const q = typeof quote === 'string' ? quote : '';
  if (q === '') return false;
  const wantedText = alnum(value);
  if (wantedText !== '' && alnum(q).includes(wantedText)) return true;
  return (
    numberSupported(value, q) ||
    dateSupported(value, q) ||
    countrySupported(value, q) ||
    currencySupported(value, q)
  );
}

// evidence_verified, per field:
//   true               the quote is in the document and shows the value
//   'unsupported_value' the quote is in the document, but it does not show the value
//   false              the quote is not in the document
//   null               not checkable (no readable text)
function verifyField(field, haystack) {
  if (!field || typeof field !== 'object' || field.status === 'missing') return field;
  if (haystack === null) return { ...field, evidence_verified: null };
  const quote = typeof field.evidence === 'string' ? normalize(field.evidence) : '';
  if (quote !== '' && haystack.includes(quote)) {
    if (valueSupportedByQuote(field.value, field.evidence))
      return { ...field, evidence_verified: true };
    return {
      ...field,
      evidence_verified: 'unsupported_value',
      status: field.status === 'extracted' ? 'uncertain' : field.status,
      confidence: Math.min(field.confidence ?? 0, 0.5),
    };
  }
  return {
    ...field,
    evidence_verified: false,
    status: field.status === 'extracted' ? 'uncertain' : field.status,
    confidence: Math.min(field.confidence ?? 0, 0.3),
  };
}

/**
 * Checks every field's evidence quote against the document text and returns a new payload.
 * evidence_verified: true (quote found and shows the value), 'unsupported_value' (quote found but
 * it does not show the value), false (quote not found), null (no text to check against, for
 * example an image). In both failing cases an extracted field becomes uncertain and confidence drops.
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
