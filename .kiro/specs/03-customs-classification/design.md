# Spec 03 design

## Two kinds of code, kept apart

| Step | Who does it | Why |
|---|---|---|
| Suggest HS code from a description | Gemini | Language understanding; the answer is only a suggestion |
| Approve the code | Human | Classification is a legal judgement |
| Look up the rate | SQL query | Must come from a cited row |
| Compute the duty | Pure function in `core` | Money must be exact, repeatable and testable |

## Core function

```js
calculateDuty({
  declaredValue,      // number, in the invoice currency
  currency,           // 'USD'
  fx: { rateToPkr, asOf, label },
  tariff: { customsDutyPct, additionalDutyPct, regulatoryDutyPct, salesTaxPct, incomeTaxPct, source, effectiveFrom },
  valuation: { incoterm, freight?, insurance? },
}) -> { status, customsValuePkr, components: [...], totalPkr, notes: [...] }
```

Use integer arithmetic on the smallest unit (paisa) or a decimal-safe approach, never raw floating-point sums of money,
then round once at the end with a stated rule. Tests cover rounding.

## Cascade rules: open question, deliberately not guessed

Pakistan applies several levies, and some are charged on top of others (for example a tax charged on value plus duties).
The exact order and base for each must be confirmed from the official source before implementing. The first version
therefore implements **customs duty only** as `status: estimated` and lists the other components as "not computed"
until each rule is read from the source and added with a test that cites it.

## Data

- Source for rates: FBR's published Pakistan Customs Tariff (a PDF/spreadsheet, no API). Curate ~20 lines by hand
  into `supabase/seed/tariff_pk.csv`, with `source_url`, page/section in `source_note`, and the date checked.
- Rates change through notifications during the year; the UI states the effective date and that rates must be re-verified.
- Exchange rates: a small manual `exchange_rates` seed labeled `demo`, with the date.

## Endpoints

- `POST /api/shipments/:id/classify` -> creates unapproved suggestions
- `PATCH /api/hs-suggestions/:id` -> approve or correct
- `POST /api/shipments/:id/calculate-duty` -> only for approved lines

## Risks

- Tariff PDFs are large and rates are easy to mis-copy; double-check each row against the source and keep the list short.
- If time is tight: ship R1 and R2 only and show "duty estimate: planned" honestly.
