import {
  nameTokens,
  normalizeCountry,
  normalizeCurrency,
  normalizeIdentifier,
  tokenOverlap,
} from './normalize.js';
import { THRESHOLDS, percentDifference, severityForNumeric } from './severity.js';

export const DOCUMENT_TYPES = Object.freeze([
  'commercial_invoice',
  'packing_list',
  'certificate_of_origin',
]);

export const DOC_LABEL = Object.freeze({
  commercial_invoice: 'commercial invoice',
  packing_list: 'packing list',
  certificate_of_origin: 'certificate of origin',
});

// Wording rule for the whole report: say "possible inconsistency" and "requires manual
// verification". The system finds differences; it never decides why they exist.
const ACTION = Object.freeze({
  high: 'Requires manual verification before relying on these documents. Ask the exporter which value is correct and have the incorrect document corrected or explained.',
  medium:
    'Requires manual verification: confirm which value is correct and whether the difference has an ordinary explanation.',
  low: 'Review when convenient. This is likely a wording or formatting difference.',
});

// Added when a number can be read two ways. Documents are only compared when NO reading makes
// them match, so this is a note for the reviewer, not a reason to lower the severity.
const AMBIGUOUS_NOTE =
  'One of these numbers can be read two ways (for example 1.234 is 1,234 or 1.234) and no reading makes the documents match; the closest reading is shown.';

const round3 = (n) => Math.round(n * 1000) / 1000;
const fmt = (n) => String(round3(n));

function joinList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** "500 kg on the commercial invoice, 650 kg on the packing list" */
function describeValues(entries, suffix = '') {
  return joinList(entries.map(([doc, text]) => `${text}${suffix} on the ${DOC_LABEL[doc]}`));
}

function makeFinding({
  field,
  category,
  severity,
  documents,
  values,
  difference = null,
  explanation,
  action,
  keySuffix = '',
}) {
  const docs = [...documents].sort();
  return {
    key: `${field}${keySuffix ? `|${keySuffix}` : ''}|${docs.join('+')}`,
    field,
    category,
    severity,
    documents: docs,
    values,
    difference,
    explanation,
    recommendedAction: action ?? ACTION[severity],
  };
}

/** Differences between numbers, for example weights or quantities. `values` maps document type to a number. */
export function compareNumeric({
  field,
  category,
  label,
  unit = '',
  values,
  tolerancePercent,
  keySuffix = '',
  ambiguous = false,
}) {
  const entries = Object.entries(values);
  if (entries.length < 2) return null;

  const numbers = entries.map(([, v]) => v);
  const smallest = Math.min(...numbers);
  const largest = Math.max(...numbers);
  const percent = percentDifference(smallest, largest);
  const severity = severityForNumeric(percent, tolerancePercent);
  if (!severity) return null;

  const absolute = round3(largest - smallest);
  const unitText = unit ? ` ${unit}` : '';
  return makeFinding({
    field,
    category,
    severity,
    documents: entries.map(([d]) => d),
    values: Object.fromEntries(entries.map(([d, v]) => [d, `${fmt(v)}${unitText}`])),
    difference: { absolute, percent: round3(percent), unit },
    keySuffix,
    explanation:
      `Possible inconsistency in ${label}: ${describeValues(
        entries.map(([d, v]) => [d, fmt(v)]),
        unitText,
      )}. ` +
      `The difference is ${fmt(absolute)}${unitText} (${percent.toFixed(1)}% of the larger value).` +
      (ambiguous ? ` ${AMBIGUOUS_NOTE}` : ''),
  });
}

/** Text that must match once formatting is ignored: invoice numbers and currency codes. */
export function compareExact({ field, category, label, values, normalize, keySuffix = '' }) {
  const entries = Object.entries(values)
    .map(([doc, raw]) => [doc, raw, normalize(raw)])
    .filter(([, , normalized]) => normalized !== null);
  if (entries.length < 2) return null;
  if (new Set(entries.map(([, , n]) => n)).size === 1) return null;

  return makeFinding({
    field,
    category,
    severity: 'high',
    documents: entries.map(([d]) => d),
    values: Object.fromEntries(entries.map(([d, raw]) => [d, String(raw)])),
    keySuffix,
    explanation: `Possible inconsistency in ${label}: ${describeValues(entries.map(([d, raw]) => [d, `"${raw}"`]))}.`,
  });
}

export const compareInvoiceNumber = (values) =>
  compareExact({
    field: 'invoiceNumber',
    category: 'identifier',
    label: 'invoice number',
    values,
    normalize: normalizeIdentifier,
  });

export const compareCurrency = (values) =>
  compareExact({
    field: 'currency',
    category: 'currency',
    label: 'currency',
    values,
    normalize: normalizeCurrency,
  });

/** Country of origin. Two different recognized countries are high; unrecognized text is less certain. */
export function compareCountry(values) {
  const entries = Object.entries(values)
    .map(([doc, raw]) => [doc, raw, normalizeCountry(raw)])
    .filter(([, , n]) => n !== null);
  if (entries.length < 2) return null;

  const same = (a, b) => (a.code && b.code ? a.code === b.code : a.text === b.text);
  const first = entries[0][2];
  if (entries.every(([, , n]) => same(first, n))) return null;

  const allRecognized = entries.every(([, , n]) => n.code !== null);
  const severity = allRecognized ? 'high' : 'medium';
  return makeFinding({
    field: 'originCountry',
    category: 'origin',
    severity,
    documents: entries.map(([d]) => d),
    values: Object.fromEntries(entries.map(([d, raw]) => [d, String(raw)])),
    explanation:
      `Possible inconsistency in country of origin: ${describeValues(entries.map(([d, raw]) => [d, `"${raw}"`]))}.` +
      (allRecognized
        ? ''
        : ' At least one of these was not recognized as a known country name, so this comparison is less certain.'),
  });
}

/** Company names. Identical after removing case, punctuation and legal suffixes means no finding. */
export function compareParty({ field, label, values }) {
  const entries = Object.entries(values)
    .map(([doc, raw]) => [doc, raw, nameTokens(raw)])
    .filter(([, , tokens]) => tokens.length > 0);
  if (entries.length < 2) return null;

  let lowest = 1;
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      lowest = Math.min(lowest, tokenOverlap(entries[i][2], entries[j][2]));
    }
  }
  if (lowest === 1) return null;

  const severity = lowest >= THRESHOLDS.nameSimilarMin ? 'low' : 'medium';
  return makeFinding({
    field,
    category: 'party',
    severity,
    documents: entries.map(([d]) => d),
    values: Object.fromEntries(entries.map(([d, raw]) => [d, String(raw)])),
    explanation:
      `${severity === 'low' ? 'The names are similar but not identical' : 'Possible inconsistency'} in ${label}: ` +
      `${describeValues(entries.map(([d, raw]) => [d, `"${raw}"`]))}. Word overlap is ${Math.round(lowest * 100)}%.`,
  });
}

/** Description of one product line that appears on two documents. */
export function compareDescription({ lineNumber, refDoc, otherDoc, refText, otherText, overlap }) {
  if (overlap >= THRESHOLDS.descriptionSameMin) return null;
  const severity = overlap >= THRESHOLDS.descriptionMatchMin ? 'low' : 'medium';
  return makeFinding({
    field: 'description',
    category: 'description',
    severity,
    documents: [refDoc, otherDoc],
    values: { [refDoc]: refText, [otherDoc]: otherText },
    keySuffix: `line ${lineNumber}`,
    explanation:
      `${severity === 'low' ? 'The wording differs' : 'Possible inconsistency'} in the product description of line ${lineNumber}: ` +
      `${describeValues([
        [refDoc, `"${refText}"`],
        [otherDoc, `"${otherText}"`],
      ])}. Word overlap is ${Math.round(overlap * 100)}%.`,
  });
}

/**
 * Goods named on a certificate of origin. `coverage` is the share of the certificate's description
 * words that also appear in the reference document's goods (1 means every word is found).
 */
export function compareCertificateGoods({ lineNumber, refDoc, otherDoc, text, coverage }) {
  if (coverage >= THRESHOLDS.descriptionSameMin) return null;
  const severity = coverage >= THRESHOLDS.descriptionMatchMin ? 'low' : 'medium';
  return makeFinding({
    field: 'description',
    category: 'description',
    severity,
    documents: [refDoc, otherDoc],
    values: { [otherDoc]: `"${text}"`, [refDoc]: 'goods listed on its lines' },
    keySuffix: `certificate line ${lineNumber}`,
    explanation:
      `${severity === 'low' ? 'The wording differs' : 'Possible inconsistency'}: the goods on the ${DOC_LABEL[otherDoc]} ` +
      `("${text}") only partly match the goods on the ${DOC_LABEL[refDoc]}. ${Math.round(coverage * 100)}% of its description words appear there.`,
  });
}

/** A value that other documents provide but a document that should have it does not. */
export function gapFinding({ field, label, missingDocs, values }) {
  const present = Object.keys(values);
  return makeFinding({
    field,
    category: 'completeness',
    severity: 'low',
    documents: [...present, ...missingDocs],
    values: {
      ...Object.fromEntries(Object.entries(values).map(([d, v]) => [d, String(v)])),
      ...Object.fromEntries(missingDocs.map((d) => [d, 'not provided'])),
    },
    keySuffix: 'missing',
    explanation:
      `Information gap: the ${joinList(missingDocs.map((d) => DOC_LABEL[d]))} does not state the ${label}, ` +
      `which the ${joinList(present.map((d) => DOC_LABEL[d]))} provides, so it could not be checked.`,
  });
}

/** Two documents give a quantity in different units, so the numbers cannot be compared directly. */
export function unitMismatchFinding({
  lineNumber,
  refDoc,
  otherDoc,
  refUnit,
  otherUnit,
  refQty,
  otherQty,
}) {
  return makeFinding({
    field: 'quantity',
    category: 'quantity',
    severity: 'medium',
    documents: [refDoc, otherDoc],
    values: { [refDoc]: `${fmt(refQty)} ${refUnit}`, [otherDoc]: `${fmt(otherQty)} ${otherUnit}` },
    keySuffix: `line ${lineNumber}`,
    explanation:
      `Possible inconsistency in the quantity of line ${lineNumber}: the units differ, ` +
      `${describeValues([
        [refDoc, `${fmt(refQty)} ${refUnit}`],
        [otherDoc, `${fmt(otherQty)} ${otherUnit}`],
      ])}, ` +
      'so the numbers cannot be compared directly.',
  });
}

/** A product line on one document with no matching line on the other. */
export function unmatchedLineFinding({ lineNumber, presentDoc, absentDoc, description }) {
  return makeFinding({
    field: 'lineItem',
    category: 'lineItem',
    severity: 'medium',
    documents: [presentDoc, absentDoc],
    values: {
      [presentDoc]: `"${description ?? '(no description)'}"`,
      [absentDoc]: 'no matching line',
    },
    keySuffix: `${presentDoc} line ${lineNumber}`,
    explanation:
      `Possible inconsistency: line ${lineNumber} of the ${DOC_LABEL[presentDoc]} ("${description ?? 'no description'}") ` +
      `has no matching line on the ${DOC_LABEL[absentDoc]}.`,
  });
}

/** A weight that exists but cannot be used, for example "12 tons" (the unit is ambiguous). */
export function weightProblemFinding({ field, label, doc, weight }) {
  const why = {
    unrecognized_unit: 'its unit is not recognized or is ambiguous',
    missing_unit: 'it has no unit',
    unreadable: 'it could not be read as a number with a unit',
  }[weight.reason];
  return makeFinding({
    field,
    category: 'completeness',
    severity: 'medium',
    documents: [doc],
    values: { [doc]: weight.raw },
    keySuffix: 'unusable',
    explanation: `The ${label} on the ${DOC_LABEL[doc]} ("${weight.raw}") was excluded from comparison because ${why}.`,
  });
}

/**
 * The invoice's stated total does not match its lines plus any itemized charges.
 *
 * `charges` holds the freight, insurance, tax and discount amounts that were found (or null). With
 * itemized charges the arithmetic is exact, so a gap is high. With none, the gap may simply be
 * freight, insurance, tax or a discount that was not extracted, so it is medium and says so.
 */
export function invoiceTotalFinding({
  statedTotal,
  summedTotal,
  expectedTotal,
  percent,
  charges = null,
  ambiguous = false,
}) {
  const itemized = charges !== null;
  const severity = itemized ? 'high' : 'medium';
  const parts = itemized
    ? Object.entries(charges).map(
        ([name, amount]) => `${name === 'discount' ? 'minus' : 'plus'} ${name} ${fmt(amount)}`,
      )
    : [];
  const arithmetic = itemized
    ? `lines add up to ${fmt(summedTotal)} ${parts.join(' ')} = ${fmt(expectedTotal)}`
    : `lines add up to ${fmt(summedTotal)}`;
  return makeFinding({
    field: 'invoiceTotalVsLines',
    category: 'value',
    severity,
    documents: ['commercial_invoice'],
    values: { commercial_invoice: `stated ${fmt(statedTotal)}, ${arithmetic}` },
    difference: {
      absolute: round3(Math.abs(statedTotal - expectedTotal)),
      percent: round3(percent),
      unit: '',
    },
    explanation:
      `Possible inconsistency within the commercial invoice: the stated total ${fmt(statedTotal)} differs from ` +
      (itemized
        ? `its line totals plus the freight, insurance, tax and discount it lists (${fmt(expectedTotal)}) `
        : `the sum of its line totals ${fmt(summedTotal)} `) +
      `by ${percent.toFixed(1)}%.` +
      (itemized
        ? ''
        : ' The difference may be freight, insurance, tax or a discount that is not itemized on the invoice.') +
      (ambiguous ? ` ${AMBIGUOUS_NOTE}` : ''),
  });
}

/** Dates that no common reading can make equal. `values` maps document type to the text as written. */
export function compareDates({ values }) {
  const entries = Object.entries(values);
  return makeFinding({
    field: 'invoiceDate',
    category: 'date',
    severity: 'medium',
    documents: entries.map(([d]) => d),
    values: Object.fromEntries(entries.map(([d, raw]) => [d, String(raw)])),
    explanation: `Possible inconsistency in the invoice date: ${describeValues(entries.map(([d, raw]) => [d, `"${raw}"`]))}.`,
  });
}
