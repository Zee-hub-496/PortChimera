---
inclusion: fileMatch
fileMatchPattern: 'apps/api/src/ai/**'
---

# AI integration rules

- Code talks to an `AiProvider` interface (`aiProvider.js`), not to Gemini directly. `geminiProvider.js` is one implementation.
- The model name comes from `GEMINI_MODEL`. Never hard-code it: Google retires models (Gemini 2.5 requests start being rerouted on 2026-12-01 per Google's Firebase docs).
- Free-tier limits are small and change. Before relying on a number, check the author's own AI Studio rate-limit page. Do not copy quotas from blogs into code or docs as facts.
- Three separate AI jobs, three separate prompts and schemas: **extraction**, **HS classification**, **discrepancy explanation**. Never combine them.
- Always request structured JSON and validate with zod. Reject, do not repair, malformed output. Retry once only for timeouts, 429 and 5xx, with backoff.
- Every extracted field: `{ value, confidence, status, evidence }` with `status` in `extracted | missing | uncertain | conflicting`.
- The model must never invent a value. If it is not in the document, `status: "missing"` and `value: null`.
- Cache extraction results by file SHA-256 so repeated uploads cost no requests.
- Save the model name and schema version with every stored result for reproducibility.
- Use AI only for: reading documents, suggesting HS codes, explaining ambiguous differences. Everything else is normal code.
- Tests use recorded fixtures or a fake provider. Automated tests must never call the real API.
