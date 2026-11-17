# Spec 04 tasks

Tasks 1 to 5 verified in the authoring sandbox (Node 22): 82 cross-check tests pass.
Mutation checks: removing the tolerance, the company-suffix rules, the larger-value percent, the critical rule, or the tonne conversion each made tests fail.
Decisions that refine this spec are listed in `design.md` under "Decisions made during the build".

- [x] 1. Synthetic fixtures: `fixtures/crosscheck/demo-consistent.json` and `demo-weight-mismatch.json`; other mismatches are built inside the tests (R3.2)
- [x] 2. `normalize.js` with tests for units, dates, numbers, currencies, countries, names (R1)
- [x] 3. `severity.js` thresholds as data + tests at each boundary (R3)
- [x] 4. `compare.js` and `lines.js`: per-field comparison, tolerance, line matching (R2)
- [x] 5. `crossCheck` orchestration + summary + wording test (R4, R5.1)
- [ ] 6. Persist findings to `discrepancies`, stable re-run behaviour, audit on review decisions (R5.2, R6)
- [ ] 7. Endpoints: `POST /api/shipments/:id/cross-check`, `GET /api/shipments/:id/discrepancies`, `PATCH /api/discrepancies/:id`
- [ ] 8. Optional AI explanation for ambiguous name/description differences, fake-provider tested (R7)
- [ ] 9. Web: discrepancy tab with side-by-side values, severity badges, review actions
