# Spec 02 tasks

Legend: `[x]` built and verified, `[-]` written not yet run, `[ ]` not started.

- [ ] 1. Verify the Gemini model and free-tier limits in the author's AI Studio dashboard; record in `docs/AI_NOTES.md` (R5.3)
- [ ] 2. Create synthetic fixtures: clean invoice, scanned/blurry, missing invoice number, multi-product, packing list, certificate of origin, injection attempt (`fixtures/`)
- [ ] 3. File validation module (type by magic bytes, size) + tests for each rejection (R1.1, R1.2)
- [ ] 4. Zod schemas per document type + tests for malformed output (R2, R3.1)
- [ ] 5. Evidence verifier + tests (found, not found, whitespace/case differences) (R3.2)
- [ ] 6. `AiProvider` interface, `fakeProvider`, Gemini provider with timeout/retry (R5.2)
- [ ] 7. Upload endpoint + storage + `documents` row + audit (R1, R7)
- [ ] 8. Process endpoint (202), background job, status updates, hash cache (R2.1, R5.1)
- [ ] 9. Prompt: data-not-instructions, no invention; run once on one synthetic invoice with the real API and record the result (R2.3, R4)
- [ ] 10. Injection fixture test with the fake provider and one real run (R4.2)
- [ ] 11. Review endpoint -> `line_items` (R6.2)
- [ ] 12. Web: upload page, status polling, review screen with evidence and "not verifiable" states (R6)
- [ ] 13. Docs: `docs/AI_NOTES.md` (what the AI does and does not do)
