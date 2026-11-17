# Spec 03: Customs classification and duty estimation (limited scope)

## Goal
Suggest an HS code for each product, let a human approve it, and compute an *estimate* of Pakistan customs
duty from a small curated, cited tariff table. This is the first feature to cut if time runs short.

## Requirements

### R1. HS suggestion (AI)
1. WHEN classification is requested for a shipment THEN the system SHALL suggest one HS code per line item with explanation and confidence.
2. THE explanation SHALL cite which words in the product description drove the suggestion.
3. THE suggestion SHALL be stored as unapproved. THE UI SHALL say it is a suggestion and not an official classification.

### R2. Human approval
1. WHEN the user approves or edits a code THEN the system SHALL save `approved_code`, `approved_by`, `approved_at` and write an audit entry.
2. THE system SHALL NOT compute a duty estimate from an unapproved code.

### R3. Tariff lookup
1. THE system SHALL look up rates only in `tariff_rates`, matching jurisdiction `PK`, the approved code and an effective date covering the shipment date.
2. WHEN no row matches THEN the estimate SHALL have `status = unverified`, show "cannot verify", and SHALL NOT use any default rate.
3. Every `tariff_rates` row SHALL have `source_url` and `effective_from`. The seed SHALL cover about 20 codes chosen for the demo.

### R4. Duty calculation (deterministic)
1. THE calculation SHALL be pure code in `packages/core/src/customs` and SHALL NOT call the AI.
2. THE calculation SHALL convert the declared value to PKR using a dated `exchange_rates` row, shown with its date and label.
3. THE calculation SHALL account for the Incoterm: WHEN terms are not CIF/CIP THEN freight and insurance inputs SHALL be explicit; WHEN unknown THEN the estimate SHALL say the valuation basis is unconfirmed.
4. THE result SHALL include a line-by-line breakdown (value, each duty/tax component, total).
5. Taxes whose calculation rule is not yet verified from the cited source SHALL be shown as "not computed", not guessed.

### R5. Presentation
1. THE UI SHALL label the result "Estimated customs assessment, not an official declaration".
2. THE UI SHALL show the source and effective date of every rate used.
