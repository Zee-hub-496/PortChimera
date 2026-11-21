import { AppError } from '../../middleware/errorHandler.js';

// Pure: turns reviewed extraction payloads (spec 02) into the input of crossCheck (spec 04).
// No database, no Express. Only payloads a person has reviewed are ever passed in.

const DOCUMENT_TYPES = ['commercial_invoice', 'packing_list', 'certificate_of_origin'];

/** The value of one extracted field, or null when it is absent, missing or blank. */
function valueOf(f) {
  if (!f || typeof f !== 'object' || f.status === 'missing') return null;
  const v = f.value;
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  return typeof v === 'string' ? v.trim() : v;
}

/** Copies only the present values, so a missing field is "not provided" and never zero. */
function pick(target, entries) {
  for (const [key, value] of entries) if (value !== null) target[key] = value;
  return target;
}

function mapLines(lines, fieldMap) {
  if (!Array.isArray(lines)) return [];
  return lines
    .map((line) => pick({}, fieldMap(line ?? {})))
    .filter((line) => Object.keys(line).length > 0);
}

const MAPPERS = {
  commercial_invoice(payload) {
    const f = payload.fields ?? {};
    const doc = pick({}, [
      ['exporter', valueOf(f.exporter)],
      ['importer', valueOf(f.importer)],
      ['invoiceNumber', valueOf(f.invoice_number)],
      ['currency', valueOf(f.currency)],
      ['totalValue', valueOf(f.total_value)],
      ['originCountry', valueOf(f.origin_country)],
      // Optional totals stated on the invoice. Older payloads do not have them.
      ['grossWeight', valueOf(f.total_gross_weight)],
      ['netWeight', valueOf(f.total_net_weight)],
    ]);
    doc.lines = mapLines(payload.lines, (l) => [
      ['description', valueOf(l.description) ?? valueOf(l.name)],
      ['quantity', valueOf(l.quantity)],
      ['unit', valueOf(l.unit)],
      ['lineTotal', valueOf(l.line_total)],
      ['grossWeight', valueOf(l.gross_weight)],
      ['netWeight', valueOf(l.net_weight)],
      ['originCountry', valueOf(l.country_of_origin)],
    ]);
    return doc;
  },
  packing_list(payload) {
    const f = payload.fields ?? {};
    const doc = pick({}, [
      ['exporter', valueOf(f.exporter)],
      ['importer', valueOf(f.importer)],
      ['invoiceNumber', valueOf(f.invoice_number)],
      ['grossWeight', valueOf(f.total_gross_weight)],
      ['netWeight', valueOf(f.total_net_weight)],
    ]);
    doc.lines = mapLines(payload.lines, (l) => [
      ['description', valueOf(l.description)],
      ['quantity', valueOf(l.quantity)],
      ['unit', valueOf(l.unit)],
      ['grossWeight', valueOf(l.gross_weight)],
      ['netWeight', valueOf(l.net_weight)],
    ]);
    return doc;
  },
  // A certificate summarizes the goods, so its description becomes one line. Its quantity and
  // weight are not mapped: the spec's rules do not compare them yet (design.md, "Not done yet"),
  // and guessing whether "weight" means gross or net could invent a false inconsistency.
  certificate_of_origin(payload) {
    const f = payload.fields ?? {};
    const doc = pick({}, [
      ['exporter', valueOf(f.exporter)],
      ['importer', valueOf(f.importer)],
      ['invoiceNumber', valueOf(f.invoice_number)],
      ['originCountry', valueOf(f.origin_country)],
    ]);
    const goods = valueOf(f.goods_description);
    if (goods !== null) doc.lines = [{ description: goods }];
    return doc;
  },
};

/**
 * @param {Array<{document_type: string, reviewed_payload: object | null}>} rows documents joined
 *   with their extraction. Rows without a reviewed payload are ignored.
 * @returns {{commercial_invoice?: object, packing_list?: object, certificate_of_origin?: object}}
 * @throws {AppError} 409 NOT_ENOUGH_REVIEWED_DOCUMENTS when fewer than two documents are reviewed
 */
export function mapReviewedPayloads(rows) {
  const documents = {};
  for (const type of DOCUMENT_TYPES) {
    const row = rows.find((r) => r.document_type === type && r.reviewed_payload);
    if (row) documents[type] = MAPPERS[type](row.reviewed_payload);
  }
  if (Object.keys(documents).length < 2) {
    throw new AppError(
      409,
      'NOT_ENOUGH_REVIEWED_DOCUMENTS',
      'Upload, extract and approve at least two documents (invoice, packing list or certificate of origin) before running a cross-check',
    );
  }
  return documents;
}
