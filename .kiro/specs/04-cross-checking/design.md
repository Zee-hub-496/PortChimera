# Spec 04 design

Everything except the optional explanation lives in `packages/core/src/crosscheck/` and is pure.

## Modules

- `normalize.js`: `toKg(value, unit)`, `normalizeName(name)`, `normalizeDate(str)`, `normalizeCurrency(str)`, `parseNumber(str)`.
- `compare.js`: `compareField(field, valuesByDocument)` returns a finding or null.
- `severity.js`: thresholds in one object so they are easy to read, explain and change.
- `index.js`: `crossCheck({ invoice, packingList, certificate })` returns `{ findings, summary }`.

## Input shape (already reviewed and approved by a human)

```js
{ invoice: { exporter, importer, invoiceNumber, currency, totalValue, originCountry, lines: [...] },
  packingList: { ... }, certificate: { ... } }
```

Any field can be `null` (not provided).

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
