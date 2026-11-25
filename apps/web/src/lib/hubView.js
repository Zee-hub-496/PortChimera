// Pure helpers for the Alerts and Documents list pages. No React, no fetch, so node:test can run them.
import { SEVERITY_ORDER, documentLabel, fieldLabel, sortFindings } from './crosscheckView.js';

export const PAGE_SIZE = 10;

const norm = (v) => String(v ?? '').toLowerCase();
const matches = (query, ...parts) => {
  const q = norm(query).trim();
  return q === '' || parts.some((p) => norm(p).includes(q));
};

/**
 * Filters findings by text (shipment number, field, document names), severity and review status.
 * Empty filter values mean "all". Order: severity first, then newest.
 */
export function filterAlerts(items, { query = '', severity = '', status = '' } = {}) {
  const kept = (items ?? []).filter(
    (f) =>
      (severity === '' || f.severity === severity) &&
      (status === '' || f.reviewStatus === status) &&
      matches(
        query,
        f.shipmentNumber,
        fieldLabel(f.field),
        f.field,
        ...(f.documents ?? []).map(documentLabel),
      ),
  );
  const newestFirst = [...kept].sort((a, b) => norm(b.createdAt).localeCompare(norm(a.createdAt)));
  // sortFindings is stable, so within one severity the newest stays first.
  return sortFindings(newestFirst).sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
}

/** Filters documents by text (shipment number, file name, type), processing status and type. */
export function filterDocuments(items, { query = '', status = '', type = '' } = {}) {
  return (items ?? []).filter(
    (d) =>
      (status === '' || d.processingStatus === status) &&
      (type === '' || d.documentType === type) &&
      matches(query, d.shipmentNumber, d.originalFilename, documentLabel(d.documentType)),
  );
}

/** One page of a list, with the clamped page number and the page count (at least 1). */
export function paginate(items, page, size = PAGE_SIZE) {
  const list = items ?? [];
  const pages = Math.max(1, Math.ceil(list.length / size));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pages);
  return {
    page: current,
    pages,
    total: list.length,
    items: list.slice((current - 1) * size, current * size),
  };
}

/** "Showing 11 to 20 of 34" (or "No results"). */
export function rangeText({ page, total, items }) {
  if (total === 0) return 'No results';
  const first = (page - 1) * PAGE_SIZE + 1;
  return `Showing ${first} to ${first + items.length - 1} of ${total}`;
}
