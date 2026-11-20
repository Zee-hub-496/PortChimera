# Spec 04 design

Everything except the optional explanation lives in `packages/core/src/crosscheck/` and is pure.

## Modules

- `normalize.js`: `toKg(value, unit)`, `normalizeName(name)`, `normalizeDate(str)`, `normalizeCurrency(str)`, `parseNumber(str)`.
- `compare.js`: `compareField(field, valuesByDocument)` returns a finding or null.
- `severity.js`: thresholds in one object so they are easy to read, explain and change.
- `index.js`: `crossCheck({ invoice, packingList, certificate })` returns `{ findings, summary }`.

## Input shape (already reviewed and approved by a human)

Keys match the database document types, so the API can pass rows straight through:

```js
{ commercial_invoice: { exporter, importer, invoiceNumber, currency, totalValue, originCountry,
                        grossWeight, netWeight, lines: [{ description, quantity, unit, lineTotal,
                        grossWeight, netWeight, originCountry }] },
  packing_list: { ... }, certificate_of_origin: { ... } }
```

Any field can be missing. Weights may be `"500 kg"` or `{ value, unit }`. Numbers may be text such as `"1,200.50"`.

## Decisions made during the build

These refine the proposal below. Each is covered by a test.

- **Percent** is the difference divided by the larger value (500 vs 650 is 23.1%). Requirement R3.2 originally said 30%, which used a different base; it was corrected.
- **Exactly 10%** is medium (the boundary is "up to 10%").
- **Weights are compared once, at document level.** A document's weight is its stated total, or the sum of its line weights when every line has one. Comparing both would report one mismatch twice.
- **Unrecognized weight units are excluded, not guessed.** "ton" and "tons" are ambiguous (metric, short and long tons differ by up to 10%), so they produce a medium finding "excluded from comparison".
- **Certificates of origin are checked by coverage, not line by line.** A certificate summarizes the goods, so its description words are checked against all reference lines. Pairing its one line with the first invoice line would create a false finding.
- **Reference document** for line matching is the first one present in this order: invoice, packing list, certificate. Other documents are compared to it, not to each other.
- **Unrecognized country names** (not in our list of about 40) give a medium finding, not high, and say so.
- **`critical` appears only in the report summary**, never on an individual finding (see the severity table).
- **Nothing compared** gives the overall result `not_enough_data`, never `consistent`.
- **Persistence (migration 0002):** `discrepancies.finding_key` holds the stable key, unique per shipment. A re-run inserts new findings, updates open ones, deletes open ones that no longer apply, and leaves decided ones untouched (a decided finding keeps its old values even if the data changed). The latest summary is stored on `shipments.cross_check_summary`.
- **Mapping:** only reviewed payloads are used; the certificate's `quantity` and `weight` are not mapped because the rules do not compare them yet.
- **Not done yet:** per-line origin and weight checks, quantity checks for the certificate, AI explanations (R7).

## Initial severity rules (proposal; the author can adjust)

| Case | Severity |
|---|---|
| Origin country differs between documents | high |
| Weight or quantity differs by more than 10% | high |
| Weight or quantity differs by more than the tolerance and up to 10% | medium |
| Invoice number differs where both are provided | high |
| Invoice total differs from sum of line totals by more than 1% | high |
| Currency differs between documents | high |
| Exporter or importer names differ after normalization (token overlap under 0.8) | medium |
| Names similar but not equal (overlap 0.8 or more) | low |
| Description token overlap under 0.3 | medium; between 0.3 and 0.6 low |
| Required field missing in one document but present in others | low (information gap) |
| Several high findings together | summary flags "multiple risk indicators"; individual severities are unchanged |

`critical` is reserved for combinations of high findings on value, origin and quantity at once. Document this choice
in the report so a reader understands it.

## Name matching

Lowercase, strip punctuation, remove suffixes (ltd, limited, llc, inc, co, corp, pvt, private), split into tokens,
compare sets with Jaccard overlap. Simple, explainable and testable. No AI is needed here.

## Percentage definition

`percent = |a - b| / max(|a|, |b|) * 100` so the result is the same in either direction. State this in the report.

## Re-running

Findings get a stable key (`field` + sorted document types). On re-run, matching open findings are updated; reviewed ones
keep their decision unless the underlying values changed.

## Tests (all in `packages/core/test/crosscheck.test.js`)

Matching documents; weight mismatch (500 vs 650 kg); same weight in kg vs g vs lb; quantity mismatch; origin mismatch;
currency mismatch; missing fields; case and punctuation differences; rounding within tolerance; name suffix differences;
no fraud wording appears in any generated text.
