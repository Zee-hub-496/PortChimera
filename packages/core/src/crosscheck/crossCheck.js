import { CrossCheckInputError } from './errors.js';
import { matchLines, mergeDuplicateLines } from './lines.js';
import {
  DOCUMENT_TYPES,
  DOC_LABEL,
  compareCertificateGoods,
  compareCountry,
  compareCurrency,
  compareDates,
  compareDescription,
  compareInvoiceNumber,
  compareNumeric,
  compareParty,
  gapFinding,
  invoiceTotalFinding,
  unitMismatchFinding,
  unmatchedLineFinding,
  weightProblemFinding,
} from './compare.js';
import {
  descriptionTokens,
  displayUnit,
  normalizeCountry,
  normalizeCurrency,
  normalizeUnit,
  numberReadings,
  parseNumber,
  parseWeight,
  readDates,
} from './normalize.js';
import { THRESHOLDS, percentDifference, severityRank } from './severity.js';

const round6 = (n) => Math.round(n * 1e6) / 1e6;
const isPresent = (v) => v !== null && v !== undefined && v !== '';

// ---------------------------------------------------------------------------
// Reading a document's values
// ---------------------------------------------------------------------------

/**
 * Numbers such as "1.234" can be read two ways. Instead of guessing, each document's number takes
 * the reading that agrees best with the others. If even the best readings differ, the caller still
 * reports it, but marks it `ambiguous` (never "high") so the reader knows the format is in doubt.
 *
 * @param {Record<string, number>} values default reading per document
 * @param {Record<string, number[]>} readings every reading per document
 * @returns {{chosen: Record<string, number>, ambiguous: boolean}}
 */
function pickClosest(values, readings) {
  const chosen = { ...values };
  let ambiguous = false;
  for (const doc of Object.keys(values)) {
    const options = readings[doc];
    if (!options || options.length < 2) continue;
    ambiguous = true;
    const others = Object.entries(chosen)
      .filter(([d]) => d !== doc)
      .map(([, v]) => v);
    if (others.length === 0) continue;
    const gap = (n) => Math.max(...others.map((o) => percentDifference(n, o)));
    chosen[doc] = options.reduce((best, n) => (gap(n) < gap(best) ? n : best));
  }
  return { chosen, ambiguous };
}

/** Document-level origin, or the single origin shared by all of its lines. */
function effectiveOrigin(doc) {
  if (isPresent(doc.originCountry)) return doc.originCountry;
  const lines = Array.isArray(doc.lines) ? doc.lines : [];
  if (lines.length === 0 || !lines.every((l) => isPresent(l?.originCountry))) return null;
  const distinct = new Set(lines.map((l) => normalizeCountry(l.originCountry)?.text));
  return distinct.size === 1 ? lines[0].originCountry : null;
}

/**
 * A document's weight in kilograms: its stated total, or the sum of its line weights when every
 * line has one. Lines are summed here (not compared one by one) so a weight difference is reported
 * once, not twice.
 */
function effectiveWeight(doc, field) {
  const direct = parseWeight(doc[field]);
  if (direct) return { ...direct, source: 'document total' };

  const lines = Array.isArray(doc.lines) ? doc.lines : [];
  if (lines.length === 0) return null;
  const parsed = lines.map((l) => parseWeight(l?.[field]));
  if (parsed.some((p) => p === null)) return null;
  const unusable = parsed.find((p) => p.kg === null);
  if (unusable) return { ...unusable, source: 'line weight' };
  return {
    kg: round6(parsed.reduce((sum, p) => sum + p.kg, 0)),
    raw: `${lines.length} line weight(s) added up`,
    source: 'sum of line weights',
  };
}

// ---------------------------------------------------------------------------
// The scalar fields: one value per document
// ---------------------------------------------------------------------------

// `expected` lists the documents that normally state the value (see the table in the spec).
// If another document provides it but an expected one does not, that is reported as an information gap.
const FIELDS = [
  { field: 'invoiceNumber', label: 'invoice number', kind: 'invoiceNumber', expected: ['commercial_invoice'], get: (d) => d.invoiceNumber },
  { field: 'invoiceDate', label: 'invoice date', kind: 'date', expected: ['commercial_invoice'], get: (d) => d.invoiceDate },
  { field: 'exporter', label: 'exporter', kind: 'party', expected: DOCUMENT_TYPES, get: (d) => d.exporter },
  { field: 'importer', label: 'importer', kind: 'party', expected: ['commercial_invoice', 'packing_list'], get: (d) => d.importer },
  { field: 'currency', label: 'currency', kind: 'currency', expected: ['commercial_invoice'], get: (d) => d.currency },
  { field: 'originCountry', label: 'country of origin', kind: 'country', expected: ['certificate_of_origin'], get: effectiveOrigin },
  { field: 'totalValue', label: 'total value', kind: 'value', expected: ['commercial_invoice'], get: (d) => parseNumber(d.totalValue) },
  { field: 'grossWeight', label: 'gross weight', kind: 'weight', expected: ['packing_list'], get: (d) => effectiveWeight(d, 'grossWeight') },
  { field: 'netWeight', label: 'net weight', kind: 'weight', expected: [], get: (d) => effectiveWeight(d, 'netWeight') },
]; // prettier-ignore

// ---------------------------------------------------------------------------
// The main entry point
// ---------------------------------------------------------------------------

/**
 * Compares a commercial invoice, packing list and certificate of origin and reports possible inconsistencies.
 *
 * This is deterministic code: the same input always gives the same report, and no AI is involved.
 * Input values should already be reviewed by a person (spec 02). Any field may be missing.
 *
 * Document shape (all fields optional):
 *   { exporter, importer, invoiceNumber, currency, totalValue, originCountry,
 *     grossWeight: {value, unit} | "500 kg", netWeight: ...,
 *     lines: [{ description, quantity, unit, lineTotal, grossWeight, netWeight, originCountry }] }
 *
 * @param {{commercial_invoice?: object, packing_list?: object, certificate_of_origin?: object}} documents
 * @param {{tolerancePercent?: number}} [options]
 */
export function crossCheck(
  documents,
  { tolerancePercent = THRESHOLDS.numericTolerancePercent } = {},
) {
  if (documents === null || typeof documents !== 'object' || Array.isArray(documents)) {
    throw new CrossCheckInputError('documents must be an object keyed by document type');
  }
  for (const key of Object.keys(documents)) {
    if (!DOCUMENT_TYPES.includes(key)) {
      throw new CrossCheckInputError(
        `Unknown document type "${key}". Use: ${DOCUMENT_TYPES.join(', ')}`,
      );
    }
  }
  const present = DOCUMENT_TYPES.filter((t) => documents[t] !== null && documents[t] !== undefined);
  for (const t of present) {
    if (typeof documents[t] !== 'object' || Array.isArray(documents[t])) {
      throw new CrossCheckInputError(`${t} must be an object`);
    }
  }
  if (present.length < 2) {
    throw new CrossCheckInputError('At least two documents are needed to cross-check');
  }
  if (!Number.isFinite(tolerancePercent) || tolerancePercent < 0) {
    throw new CrossCheckInputError('tolerancePercent must be zero or more');
  }

  const findings = [];
  const comparedFields = [];
  const notCompared = [];
  const add = (f) => f && findings.push(f);

  // --- Fields that appear once per document -------------------------------------------------
  const currencies = Object.fromEntries(
    present.filter((t) => isPresent(documents[t].currency)).map((t) => [t, documents[t].currency]),
  );
  let currenciesDiffer = false;

  for (const spec of FIELDS) {
    const values = {};
    for (const t of present) {
      const v = spec.get(documents[t]);
      if (isPresent(v)) values[t] = v;
    }
    const docsWithValue = Object.keys(values);
    if (docsWithValue.length === 0) continue;

    const missingExpected = spec.expected.filter(
      (t) => present.includes(t) && !docsWithValue.includes(t),
    );
    if (missingExpected.length > 0) {
      add(
        gapFinding({
          field: spec.field,
          label: spec.label,
          missingDocs: missingExpected,
          values: Object.fromEntries(Object.entries(values).map(([t, v]) => [t, v?.raw ?? v])),
        }),
      );
    }
    if (docsWithValue.length < 2) {
      notCompared.push({
        field: spec.field,
        reason: `only the ${DOC_LABEL[docsWithValue[0]]} provides it`,
      });
      continue;
    }

    let finding = null;
    switch (spec.kind) {
      case 'invoiceNumber':
        finding = compareInvoiceNumber(values);
        break;
      case 'party':
        finding = compareParty({ field: spec.field, label: spec.label, values });
        break;
      case 'currency':
        finding = compareCurrency(values);
        currenciesDiffer = finding !== null;
        break;
      case 'country':
        finding = compareCountry(values);
        break;
      case 'value': {
        if (currenciesDiffer) {
          notCompared.push({
            field: spec.field,
            reason: 'the documents use different currencies, so values are not comparable',
          });
          continue;
        }
        const code = normalizeCurrency(Object.values(currencies)[0] ?? '') ?? '';
        const { chosen, ambiguous } = pickClosest(
          values,
          Object.fromEntries(
            docsWithValue.map((t) => [t, numberReadings(documents[t].totalValue)]),
          ),
        );
        finding = compareNumeric({
          field: spec.field,
          category: 'value',
          label: spec.label,
          unit: code,
          values: chosen,
          tolerancePercent,
          ambiguous,
        });
        break;
      }
      case 'weight': {
        const usable = {};
        for (const [t, w] of Object.entries(values)) {
          if (w.kg === null)
            add(weightProblemFinding({ field: spec.field, label: spec.label, doc: t, weight: w }));
          else usable[t] = w.kg;
        }
        if (Object.keys(usable).length < 2) {
          notCompared.push({
            field: spec.field,
            reason: 'fewer than two documents have a usable weight',
          });
          continue;
        }
        const { chosen, ambiguous } = pickClosest(
          usable,
          Object.fromEntries(
            Object.keys(usable).map((t) => [t, values[t].kgReadings ?? [usable[t]]]),
          ),
        );
        finding = compareNumeric({
          field: spec.field,
          category: 'weight',
          label: spec.label,
          unit: 'kg',
          values: chosen,
          tolerancePercent,
          ambiguous,
        });
        break;
      }
      case 'date': {
        const readings = {};
        for (const [t, raw] of Object.entries(values)) {
          const found = readDates(String(raw));
          if (found.length === 0) {
            notCompared.push({
              field: spec.field,
              reason: `the ${DOC_LABEL[t]} date "${raw}" could not be read as a date`,
            });
          } else readings[t] = found;
        }
        const readable = Object.keys(readings);
        if (readable.length < 2) continue;
        // Equal when one reading is shared by every document ("03/04/2026" can be 3 April).
        const shared = readings[readable[0]].filter((d) =>
          readable.every((t) => readings[t].includes(d)),
        );
        finding =
          shared.length > 0
            ? null
            : compareDates({ values: Object.fromEntries(readable.map((t) => [t, values[t]])) });
        break;
      }
      default:
        throw new Error(`Unhandled field kind ${spec.kind}`);
    }
    comparedFields.push(spec.field);
    add(finding);
  }

  // --- The invoice against itself -----------------------------------------------------------
  // The stated total should equal the sum of the lines plus freight, insurance and tax, minus any
  // discount, for those the invoice itemizes.
  const invoice = documents.commercial_invoice;
  if (invoice) {
    const statedReadings = numberReadings(invoice.totalValue);
    const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
    const lineTotals = lines.map((l) => parseNumber(l?.lineTotal));
    if (statedReadings.length > 0 && lines.length > 0 && lineTotals.every((n) => n !== null)) {
      const summed = round6(lineTotals.reduce((a, b) => a + b, 0));
      const itemized = [
        ['freight', invoice.freightCharges, 1],
        ['insurance', invoice.insuranceCharges, 1],
        ['tax', invoice.taxAmount, 1],
        ['discount', invoice.discountAmount, -1],
      ]
        .map(([name, raw, sign]) => [name, parseNumber(raw), sign])
        .filter(([, amount]) => amount !== null);
      const expected = round6(
        summed + itemized.reduce((sum, [, amount, sign]) => sum + sign * Math.abs(amount), 0),
      );
      const stated = statedReadings.reduce((best, n) =>
        percentDifference(n, expected) < percentDifference(best, expected) ? n : best,
      );
      const percent = percentDifference(stated, expected);
      comparedFields.push('invoiceTotalVsLines');
      if (percent > THRESHOLDS.invoiceTotalVsLinesPercent) {
        add(
          invoiceTotalFinding({
            statedTotal: stated,
            summedTotal: summed,
            expectedTotal: expected,
            percent,
            charges:
              itemized.length > 0
                ? Object.fromEntries(itemized.map(([name, amount]) => [name, Math.abs(amount)]))
                : null,
            ambiguous: statedReadings.length > 1,
          }),
        );
      }
    }
  }

  // --- Product lines ------------------------------------------------------------------------
  const [refDoc, ...otherDocs] = present;
  // One product listed on several lines is added up first, so a split is not a missing line.
  const refLines = mergeDuplicateLines(documents[refDoc].lines);
  for (const otherDoc of otherDocs) {
    const otherLines = mergeDuplicateLines(documents[otherDoc].lines);
    if (refLines.length === 0 || otherLines.length === 0) {
      if (refLines.length + otherLines.length > 0) {
        notCompared.push({
          field: 'lineItems',
          reason: `the ${DOC_LABEL[refLines.length === 0 ? refDoc : otherDoc]} has no line items to compare with`,
        });
      }
      continue;
    }

    comparedFields.push('lineItems');

    // A certificate of origin summarizes the goods rather than listing each invoice line, so its
    // lines are not paired one by one. Instead: do its words appear among the reference goods?
    if (otherDoc === 'certificate_of_origin') {
      const goodsWords = new Set(refLines.flatMap((l) => descriptionTokens(l?.description)));
      otherLines.forEach((line, index) => {
        const words = descriptionTokens(line?.description);
        if (words.length === 0) return;
        const coverage = words.filter((w) => goodsWords.has(w)).length / words.length;
        add(
          compareCertificateGoods({
            lineNumber: index + 1,
            refDoc,
            otherDoc,
            text: String(line.description),
            coverage,
          }),
        );
      });
      continue;
    }

    const { pairs, unmatchedRef, unmatchedOther } = matchLines(refLines, otherLines);

    for (const { refIndex, otherIndex, overlap } of pairs) {
      const a = refLines[refIndex];
      const b = otherLines[otherIndex];
      const lineNumber = refIndex + 1;

      add(
        compareDescription({
          lineNumber,
          refDoc,
          otherDoc,
          refText: String(a?.description ?? ''),
          otherText: String(b?.description ?? ''),
          overlap,
        }),
      );

      const qtyA = parseNumber(a?.quantity);
      const qtyB = parseNumber(b?.quantity);
      if (qtyA === null || qtyB === null) continue;
      const unitA = normalizeUnit(a?.unit);
      const unitB = normalizeUnit(b?.unit);
      if (unitA && unitB && unitA !== unitB) {
        add(
          unitMismatchFinding({
            lineNumber,
            refDoc,
            otherDoc,
            refUnit: displayUnit(unitA),
            otherUnit: displayUnit(unitB),
            refQty: qtyA,
            otherQty: qtyB,
          }),
        );
      } else {
        const { chosen, ambiguous } = pickClosest(
          { [refDoc]: qtyA, [otherDoc]: qtyB },
          { [refDoc]: numberReadings(a?.quantity), [otherDoc]: numberReadings(b?.quantity) },
        );
        add(
          compareNumeric({
            field: 'quantity',
            category: 'quantity',
            label: `quantity of line ${lineNumber} ("${a?.description ?? ''}")`,
            unit: displayUnit(unitA ?? unitB),
            values: chosen,
            tolerancePercent,
            keySuffix: `line ${lineNumber}`,
            ambiguous,
          }),
        );
      }
    }
    for (const i of unmatchedRef) {
      add(
        unmatchedLineFinding({
          lineNumber: i + 1,
          presentDoc: refDoc,
          absentDoc: otherDoc,
          description: refLines[i]?.description,
        }),
      );
    }
    for (const j of unmatchedOther) {
      add(
        unmatchedLineFinding({
          lineNumber: j + 1,
          presentDoc: otherDoc,
          absentDoc: refDoc,
          description: otherLines[j]?.description,
        }),
      );
    }
  }

  // --- Report -------------------------------------------------------------------------------
  findings.sort(
    (a, b) =>
      severityRank(b.severity) - severityRank(a.severity) ||
      a.field.localeCompare(b.field) ||
      a.key.localeCompare(b.key),
  );
  return {
    findings,
    summary: summarize(
      findings,
      present,
      [...new Set(comparedFields)],
      notCompared,
      tolerancePercent,
    ),
  };
}

/**
 * The report-level severity. Individual findings stay low, medium or high. The overall result is
 * `critical` only when high findings appear in all three of: origin, quantity and value. Several
 * serious conflicts at once is a stronger risk indicator than any single one; this rule is
 * stated in the report so a reader can see why.
 */
function summarize(findings, documentsCompared, comparedFields, notCompared, tolerancePercent) {
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) bySeverity[f.severity] += 1;

  const highCategories = new Set(
    findings.filter((f) => f.severity === 'high').map((f) => f.category),
  );
  const critical = ['origin', 'quantity', 'value'].every((c) => highCategories.has(c));

  // "consistent" is only a fair thing to say if something was actually compared.
  let overall = comparedFields.length === 0 ? 'not_enough_data' : 'consistent';
  for (const s of ['high', 'medium', 'low']) {
    if (bySeverity[s] > 0) {
      overall = s;
      break;
    }
  }
  if (critical) overall = 'critical';

  return {
    documentsCompared,
    findingCount: findings.length,
    bySeverity,
    overall,
    multipleRiskIndicators: bySeverity.high + bySeverity.critical >= 2,
    comparedFields,
    notCompared,
    tolerancePercent,
    rules: {
      percentDefinition: 'difference divided by the larger of the two values',
      critical: 'high findings in origin, quantity and value at the same time',
      note: 'Findings are possible inconsistencies and risk indicators that require manual verification. They are not conclusions about intent.',
    },
  };
}
