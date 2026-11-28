# Spec 02 tasks

Legend: `[x]` built and verified ("sandbox" means the plain-logic tests ran with `node --test` in the authoring sandbox), `[-]` written but not run, `[ ]` not started.

Nothing involving the real Gemini API, real Supabase, a browser, zod or Express has been run.

- [ ] 1. Verify the Gemini model and free-tier limits in the author's AI Studio dashboard; record in `docs/AI_NOTES.md` (R5.3)
- [x] 2. Create synthetic fixtures: clean invoice, scanned/blurry, missing invoice number, multi-product, packing list, certificate of origin, injection attempt (`fixtures/`) (sandbox; fixtures regenerate identically)
- [x] 3. File validation module (type by magic bytes, size) + tests for each rejection (R1.1, R1.2) (sandbox)
- [-] 4. Zod schemas per document type + tests for malformed output (R2, R3.1) (written; zod schema tests need node_modules, not run)
- [x] 5. Evidence verifier + tests (found, not found, whitespace/case differences) (R3.2) (sandbox)
- [x] 6. `AiProvider` interface, `fakeProvider`, Gemini provider with timeout/retry (R5.2) (sandbox, fake fetch only; real Gemini not called)
- [-] 7. Upload endpoint + storage + `documents` row + audit (R1, R7) (service and handler tests with fakes ran in sandbox; Express routes and real Supabase Storage not run)
- [-] 8. Process endpoint (202), background job, status updates, hash cache (R2.1, R5.1) (job, cache and 202 behavior tested with fakes in sandbox; not run against real Supabase or Gemini)
- [x] 9. Prompt: data-not-instructions, no invention; run once on one synthetic invoice with the real API and record the result (R2.3, R4)
  - Real Gemini run on the three demo PDFs by the owner (Day 1); the prompt and structured output were later extended (schema version 3).
- [-] 10. Injection fixture test with the fake provider and one real run (R4.2) (fake provider injection test ran in sandbox; the real-API run has not been done)
- [-] 11. Review endpoint -> `line_items` (R6.2) (tested with fakes in sandbox; zod review schema and real database not run)
- [-] 12. Web: upload page, status polling, review screen with evidence and "not verifiable" states (R6) (pure helpers tested in sandbox with `node --test apps/web/test/documentView.test.js`; React page, Vite build and browser not run)
- [x] 13. Docs: `docs/AI_NOTES.md` (what the AI does and does not do) (`docs/AI_NOTES.md` written; the model and limits it tells you to look up are still unchecked, see task 1)
- [-] 14. Fixes: evidence label after approval ("Edited by you" or the original result), file always sent to Gemini with readable text as a hint, line items paired by description instead of position, undo failure tests (sandbox with fakes; zod, Express, real Gemini and Supabase not run)
