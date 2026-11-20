// Pure helpers for the cross-check page. No React, no fetch, so node:test can run them.
// Wording rule: "possible inconsistency" and "requires manual verification", never an accusation.
import { DOCUMENT_TYPES } from './documentView.js';

export const SEVERITY_ORDER = Object.freeze(['critical', 'high', 'medium', 'low']);

export const SEVERITY_LABELS = Object.freeze({
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
});

// Tailwind classes per severity. Text is always shown too, so colour is never the only signal.
export const SEVERITY_CLASSES = Object.freeze({
  critical: 'bg-red-800 text-red-100',
  high: 'bg-red-700/80 text-red-100',
  medium: 'bg-amber-700/80 text-amber-100',
  low: 'bg-slate-600 text-slate-100',
});

export const OVERALL_LABELS = Object.freeze({
  consistent: 'No possible inconsistencies found in the fields compared',
  not_enough_data: 'Not enough data to compare',
  low: 'Low risk indicators found',
  medium: 'Medium risk indicators found, requires manual verification',
  high: 'High risk indicators found, requires manual verification',
  critical: 'Several high risk indicators found, requires manual verification',
});

export const STATUS_LABELS = Object.freeze({
  open: 'Open',
  accepted: 'Accepted',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
});

export const DECISIONS = Object.freeze([
  { value: 'accepted', label: 'Accept', hint: 'I checked it and the difference is fine' },
  { value: 'resolved', label: 'Resolve', hint: 'The documents were corrected or explained' },
  { value: 'dismissed', label: 'Dismiss', hint: 'This is not a real problem' },
]);

export const DISCLAIMER =
  'These results are possible inconsistencies found by fixed rules. They are risk indicators that require manual verification, not conclusions about anyone. They are not legal or customs advice.';

const FIELD_LABELS = Object.freeze({
  invoiceNumber: 'Invoice number',
  exporter: 'Exporter',
  importer: 'Importer',
  currency: 'Currency',
  originCountry: 'Country of origin',
  totalValue: 'Total value',
  grossWeight: 'Gross weight',
  netWeight: 'Net weight',
  invoiceTotalVsLines: 'Invoice total vs line totals',
  lineItems: 'Line items',
});

const ERROR_MESSAGES = Object.freeze({
  NOT_ENOUGH_REVIEWED_DOCUMENTS:
    'Approve at least two documents first. Go to Documents, read each file, check the values and press "Confirm and approve".',
  SHIPMENT_NOT_FOUND: 'This shipment was not found.',
  DISCREPANCY_NOT_FOUND: 'This item was not found. Refresh the page.',
});

export function describeCrossCheckError(err) {
  return ERROR_MESSAGES[err?.code] ?? err?.message ?? 'Something went wrong.';
}

export function fieldLabel(field) {
  // Keys of line findings look like "lineItems" or "description"; fall back to the raw name.
  return FIELD_LABELS[field] ?? String(field ?? 'Field');
}

export function documentLabel(type) {
  return DOCUMENT_TYPES[type] ?? type;
}

/** Highest severity first, then field name, so the page order is stable. */
export function sortFindings(findings) {
  const rank = (s) => {
    const i = SEVERITY_ORDER.indexOf(s);
    return i === -1 ? SEVERITY_ORDER.length : i;
  };
  return [...(findings ?? [])].sort(
    (a, b) => rank(a.severity) - rank(b.severity) || String(a.field).localeCompare(String(b.field)),
  );
}

/** Side-by-side values: one row per document that gave a value. */
export function valueRows(finding) {
  return Object.entries(finding?.values ?? {}).map(([type, value]) => ({
    documentType: type,
    document: documentLabel(type),
    value: value === null || value === undefined || value === '' ? 'not provided' : String(value),
  }));
}

/** "150 kg (23.1% of the larger value)", or an empty string when there is no number to show. */
export function differenceText(difference) {
  if (!difference || typeof difference.absolute !== 'number') return '';
  const unit = difference.unit ? ` ${difference.unit}` : '';
  const percent =
    typeof difference.percent === 'number'
      ? ` (${Math.round(difference.percent * 10) / 10}% of the larger value)`
      : '';
  return `${difference.absolute}${unit}${percent}`;
}

export function canDecide(finding) {
  return finding?.reviewStatus === 'open';
}

/** Open items still need a person. Decided items stay visible but do not count. */
export function countOpen(findings) {
  const counts = { total: 0, bySeverity: { critical: 0, high: 0, medium: 0, low: 0 } };
  for (const f of findings ?? []) {
    if (f.reviewStatus !== 'open') continue;
    counts.total += 1;
    if (f.severity in counts.bySeverity) counts.bySeverity[f.severity] += 1;
  }
  return counts;
}

/** What the summary box shows. `summary` is null before the first check. */
export function summaryView(summary, findings) {
  if (!summary) return null;
  const open = countOpen(findings);
  return {
    overallLabel: OVERALL_LABELS[summary.overall] ?? summary.overall,
    overall: summary.overall,
    severityCounts: SEVERITY_ORDER.map((s) => ({
      severity: s,
      label: SEVERITY_LABELS[s],
      count: summary.bySeverity?.[s] ?? 0,
    })),
    openCount: open.total,
    comparedFields: (summary.comparedFields ?? []).map(fieldLabel),
    notCompared: (summary.notCompared ?? []).map((n) => `${fieldLabel(n.field)}: ${n.reason}`),
    multipleRiskIndicators: Boolean(summary.multipleRiskIndicators),
  };
}
