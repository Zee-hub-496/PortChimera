// A small zod-free stand-in for parseExtraction, so runner tests run without node_modules.
// It mirrors the real rules: strict keys, status/confidence checks, missing means value null.
import { AiError } from '../../src/ai/aiError.js';
import { DOCUMENT_FIELDS, FIELD_STATUSES, SCHEMA_VERSION } from '../../src/ai/fieldNames.js';

const bad = (msg) => new AiError('bad_output', msg);

function checkField(f, where) {
  if (!f || typeof f !== 'object') throw bad(`${where} is not an object`);
  const keys = Object.keys(f).sort().join(',');
  if (keys !== 'confidence,evidence,status,value') throw bad(`${where} has wrong keys`);
  if (!FIELD_STATUSES.includes(f.status)) throw bad(`${where} bad status`);
  if (typeof f.confidence !== 'number' || f.confidence < 0 || f.confidence > 1) {
    throw bad(`${where} bad confidence`);
  }
  if (f.status === 'missing' && f.value !== null) throw bad(`${where} missing needs null`);
}

export function plainParse(documentType, raw) {
  const def = DOCUMENT_FIELDS[documentType];
  if (!def) throw bad('unknown type');
  if (!raw || typeof raw !== 'object' || !raw.fields || typeof raw.fields !== 'object') {
    throw bad('no fields');
  }
  const allowedTop = def.lineFields.length > 0 ? ['fields', 'lines'] : ['fields'];
  for (const k of Object.keys(raw)) if (!allowedTop.includes(k)) throw bad(`unknown key ${k}`);
  for (const k of Object.keys(raw.fields)) {
    if (!def.fields.includes(k)) throw bad(`unknown field ${k}`);
  }
  for (const n of def.fields) {
    if (raw.fields[n] === undefined) {
      if (def.optional.includes(n)) continue;
      throw bad(`missing field ${n}`);
    }
    checkField(raw.fields[n], n);
  }
  if (def.lineFields.length > 0) {
    if (!Array.isArray(raw.lines)) throw bad('lines must be an array');
    raw.lines.forEach((line, i) => {
      for (const n of def.lineFields) checkField(line[n], `lines.${i}.${n}`);
    });
  }
  return { schema_version: SCHEMA_VERSION, document_type: documentType, ...raw };
}

/** Builds a field object for tests. */
export const field = (value, evidence = String(value), extra = {}) => ({
  value,
  confidence: 0.9,
  status: 'extracted',
  evidence,
  ...extra,
});
export const missing = () => ({ value: null, confidence: 0, status: 'missing', evidence: null });
