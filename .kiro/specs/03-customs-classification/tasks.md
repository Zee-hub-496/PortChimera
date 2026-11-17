# Spec 03 tasks

- [ ] 1. Read the cascade rules for each Pakistan levy from official sources; write them in `docs/CUSTOMS_RULES.md` with links (R4.5)
- [ ] 2. Curate ~20 tariff rows into `supabase/seed/tariff_pk.csv` with source and date; second-pass check each row (R3.3)
- [ ] 3. Exchange-rate seed (`demo` label) (R4.2)
- [ ] 4. `calculateDuty` in core: customs duty first, safe money math, tests: normal, zero rate, unverified, FX conversion, rounding, Incoterm cases (R4)
- [ ] 5. `suggestHsCode` in the AI provider + prompt + schema; fake provider tests (R1)
- [ ] 6. Classify endpoint and approval endpoint with ownership checks and audit (R1, R2)
- [ ] 7. Duty endpoint: lookup, refuse unapproved lines, store `duty_estimates` (R2.2, R3)
- [ ] 8. Web: customs tab with suggestions, approve/edit, estimate with source and effective date, disclaimers (R5)
- [ ] 9. Add additional levies one at a time, each with a cited test (stretch)
