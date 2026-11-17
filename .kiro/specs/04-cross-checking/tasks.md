# Spec 04 tasks

- [ ] 1. Synthetic fixture set with planted mismatches (weight, quantity, origin, currency) (R3.2)
- [ ] 2. `normalize.js` with tests for units, dates, numbers, currencies, names (R1)
- [ ] 3. `severity.js` thresholds as data + tests at each boundary (R3)
- [ ] 4. `compare.js` per-field comparison with tolerance + tests (R2)
- [ ] 5. `crossCheck` orchestration + summary + wording test (R4, R5.1)
- [ ] 6. Persist findings to `discrepancies`, stable re-run behaviour, audit on review decisions (R5.2, R6)
- [ ] 7. Endpoints: `POST /api/shipments/:id/cross-check`, `GET /api/shipments/:id/discrepancies`, `PATCH /api/discrepancies/:id`
- [ ] 8. Optional AI explanation for ambiguous name/description differences, fake-provider tested (R7)
- [ ] 9. Web: discrepancy tab with side-by-side values, severity badges, review actions
