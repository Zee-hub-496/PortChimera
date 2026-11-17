# Spec 04: Tri-document cross-checking

## Goal
Compare the invoice, packing list and certificate of origin and report possible inconsistencies, using
deterministic rules. AI may explain an ambiguous case but never decides whether documents match.

## Requirements

### R1. Normalization
1. THE system SHALL convert weights to kilograms (g, kg, lb, tonne) before comparing.
2. THE system SHALL normalize dates to ISO format, currency codes to uppercase 3-letter codes, and numbers with different separators.
3. THE system SHALL normalize company names (case, punctuation, common legal suffixes) before comparing.
4. THE system SHALL treat missing values as "not provided", never as zero.

### R2. Comparison
1. THE system SHALL compare these fields where at least two documents provide them: exporter, importer, product description, quantity, weight, country of origin, invoice value, invoice number, currency.
2. Differences within a tolerance (default 0.5% for numbers) SHALL be treated as rounding and not reported, or reported as `low`.
3. WHEN only formatting differs (case, punctuation, date format, unit that converts equal) THEN the system SHALL NOT report a medium-or-higher discrepancy.

### R3. Severity
1. THE system SHALL assign `critical`, `high`, `medium` or `low` using documented thresholds in `design.md`.
2. THE examples SHALL hold: 500 kg vs 650 kg is a high weight discrepancy of 150 kg (30%); 100 vs 90 units is a quantity discrepancy of 10; invoice origin China vs certificate Pakistan is an origin inconsistency requiring review.

### R4. Wording
1. THE report SHALL use "possible inconsistency", "risk indicator" and "requires manual verification". It SHALL NOT use "fraud".

### R5. Report
1. EACH discrepancy SHALL include: documents involved, field, each document's value, absolute and percent difference, severity, explanation, recommended human action.
2. THE report SHALL be stored in `discrepancies` and re-running the check SHALL replace open items without losing reviewed ones' decisions.

### R6. Review
1. THE user SHALL mark each discrepancy `accepted`, `resolved` or `dismissed` with an audit entry.

### R7. AI explanation (optional)
1. WHEN a description or name difference is ambiguous THEN the system MAY ask the AI for an explanation, stored as `explanation` text only. The severity SHALL stay as computed by rules.
