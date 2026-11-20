// Pure helpers for the document upload and review page. No React, no fetch, so node:test can run them.
// The server is the real gate for file checks. The checks here only save a round trip.

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
export const POLL_INTERVAL_MS = 2000;

export const DOCUMENT_TYPES = Object.freeze({
  commercial_invoice: 'Commercial invoice',
  packing_list: 'Packing list',
  certificate_of_origin: 'Certificate of origin',
});

export const STATUS_LABELS = Object.freeze({
  uploaded: 'Uploaded, not read yet',
  processing: 'AI is reading the document...',
  extracted: 'Ready for your review',
  reviewed: 'Reviewed and approved',
  failed: 'Reading failed',
});

// Same names as apps/api/src/ai/fieldNames.js (the web app cannot import from the API).
export const FIELD_LABELS = Object.freeze({
  invoice_number: 'Invoice number',
  invoice_date: 'Invoice date',
  exporter: 'Exporter',
  importer: 'Importer',
  origin_country: 'Country of origin',
  destination_country: 'Destination country',
  currency: 'Currency',
  total_value: 'Total value',
  incoterm: 'Incoterm',
  total_net_weight: 'Total net weight (kg)',
  total_gross_weight: 'Total gross weight (kg)',
  goods_description: 'Goods description',
  quantity: 'Quantity',
  weight: 'Weight',
});

export const LINE_LABELS = Object.freeze({
  name: 'Name',
  description: 'Description',
  quantity: 'Quantity',
  unit: 'Unit',
  unit_price: 'Unit price',
  line_total: 'Line total',
  net_weight: 'Net weight',
  gross_weight: 'Gross weight',
  country_of_origin: 'Origin',
});

const ERROR_MESSAGES = Object.freeze({
  AI_NOT_CONFIGURED:
    'AI reading is not set up on the server yet. Add GEMINI_API_KEY and GEMINI_MODEL to apps/api/.env and restart the API.',
  FILE_TOO_LARGE: 'That file is larger than 5 MB. Choose a smaller file.',
  DOCUMENT_EXISTS:
    'This shipment already has a document of that type. Each type can be uploaded once.',
  UNSUPPORTED_FILE_TYPE: 'Only PDF, JPEG and PNG files are accepted.',
  EMPTY_FILE: 'That file is empty.',
});

/** Plain-language message for an ApiError (or any Error). */
export function describeError(err) {
  return ERROR_MESSAGES[err?.code] ?? err?.message ?? 'Something went wrong.';
}

/** Advisory check before upload. Returns an error message or null. */
export function precheckFile(file) {
  if (!file) return 'Choose a file first.';
  if (!file.size) return ERROR_MESSAGES.EMPTY_FILE;
  if (file.size > MAX_UPLOAD_BYTES) return ERROR_MESSAGES.FILE_TOO_LARGE;
  if (!ACCEPTED_MIME_TYPES.includes(file.type)) return ERROR_MESSAGES.UNSUPPORTED_FILE_TYPE;
  return null;
}

/** Keep polling only while the server is working on the document. */
export function shouldPoll(status) {
  return status === 'processing';
}

/** Process is offered for new, failed and stuck documents, never after approval. */
export function canProcess(status) {
  return status === 'uploaded' || status === 'failed' || status === 'processing';
}

export function canReview(status) {
  return status === 'extracted' || status === 'reviewed';
}

/**
 * How trustworthy the quoted evidence is, in words.
 * true: quote found in the document text. false: not found. null: could not be checked.
 */
export function evidenceLabel(field) {
  if (field?.edited === true) return 'Edited by you';
  if (field?.status === 'missing') return 'Not found in the document';
  if (field?.evidence_verified === true) return 'Found in the document';
  if (field?.evidence_verified === false) return 'Evidence not found: AI suggestion';
  return 'Not verifiable (no readable text): AI suggestion';
}

export function confidencePercent(confidence) {
  const n = Number(confidence);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(1, Math.max(0, n)) * 100);
}

export function valueToText(value) {
  return value === null || value === undefined ? '' : String(value);
}

/** One display row per field, in the order the payload lists them. */
export function fieldRows(payload) {
  return Object.entries(payload?.fields ?? {}).map(([key, field]) => ({
    key,
    label: FIELD_LABELS[key] ?? key,
    text: valueToText(field?.value),
    confidence: confidencePercent(field?.confidence),
    status: field?.status ?? 'uncertain',
    evidence: field?.evidence ?? null,
    evidenceLabel: evidenceLabel(field),
    needsAttention:
      field?.edited !== true &&
      (field?.status !== 'extracted' || field?.evidence_verified === false),
  }));
}

/** Read-only table data for invoice and packing list lines. */
export function lineTable(payload) {
  const lines = payload?.lines ?? [];
  const keys = [];
  for (const line of lines) {
    for (const k of Object.keys(line)) if (!keys.includes(k)) keys.push(k);
  }
  return {
    columns: keys.map((k) => ({ key: k, label: LINE_LABELS[k] ?? k })),
    rows: lines.map((line) => keys.map((k) => valueToText(line[k]?.value))),
  };
}

function editedValue(original, text) {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  // Keep numbers as numbers when the AI gave a number and the edit is still numeric.
  if (typeof original === 'number') {
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
  }
  return trimmed;
}

/**
 * Builds the body for PUT /api/documents/:id/review from the AI payload and the edited texts
 * ({ fieldName: 'text' }). Untouched fields are sent as they were. An edited field becomes
 * 'extracted' (a person confirmed it), or 'missing' with a null value when it was emptied.
 * Computed keys are left out; the server strips them anyway.
 */
export function buildReviewPayload(payload, edits = {}) {
  const fields = {};
  for (const [key, field] of Object.entries(payload?.fields ?? {})) {
    const { evidence_verified: _checked, edited: _edited, ...base } = field;
    const text = edits[key];
    if (text === undefined || text === valueToText(field.value)) {
      fields[key] = base;
      continue;
    }
    const value = editedValue(field.value, text);
    fields[key] =
      value === null
        ? { ...base, value: null, status: 'missing', confidence: 1 }
        : { ...base, value, status: 'extracted', confidence: 1 };
  }
  const body = { fields };
  if (Array.isArray(payload?.lines)) {
    body.lines = payload.lines.map((line) =>
      Object.fromEntries(
        Object.entries(line).map(([k, f]) => {
          const { evidence_verified: _checked, edited: _edited, ...rest } = f;
          return [k, rest];
        }),
      ),
    );
  }
  return body;
}

/** Initial text for each editable input: the reviewed values if present, else the AI's. */
export function initialEdits(detail) {
  const payload = detail?.extraction?.reviewedPayload ?? detail?.extraction?.payload;
  return Object.fromEntries(
    Object.entries(payload?.fields ?? {}).map(([k, f]) => [k, valueToText(f?.value)]),
  );
}

/**
 * The payload to show: the reviewed version when it exists. The server does not keep
 * evidence_verified on reviewed values (a client could forge it), so each field's evidence
 * result is taken from the stored original AI payload. A field whose value differs from the
 * original is marked `edited: true` (display only; buildReviewPayload removes it again).
 */
export function shownPayload(detail) {
  const original = detail?.extraction?.payload ?? null;
  const reviewed = detail?.extraction?.reviewedPayload ?? null;
  if (!reviewed) return original;
  const fields = {};
  for (const [key, field] of Object.entries(reviewed.fields ?? {})) {
    const orig = original?.fields?.[key];
    if (orig && valueToText(orig.value) === valueToText(field?.value)) {
      fields[key] = { ...field, evidence_verified: orig.evidence_verified ?? null };
    } else {
      fields[key] = { ...field, edited: true };
    }
  }
  const lines = Array.isArray(reviewed.lines)
    ? reviewed.lines.map((line, i) => {
        const origLine = original?.lines?.[i];
        const out = {};
        for (const [key, cell] of Object.entries(line ?? {})) {
          const orig = origLine?.[key];
          out[key] =
            orig && cell && valueToText(orig.value) === valueToText(cell.value)
              ? { ...cell, evidence_verified: orig.evidence_verified ?? null }
              : cell;
        }
        return out;
      })
    : reviewed.lines;
  return { ...reviewed, fields, ...(lines === undefined ? {} : { lines }) };
}
