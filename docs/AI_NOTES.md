# AI notes: document extraction

This page says what the AI does in PortChimera, what it does not do, and how to set it up safely.

## What the AI does

It reads one uploaded document (commercial invoice, packing list or certificate of origin) and suggests values for a fixed list of fields. It does nothing else. It has no tools, no web access and no access to other documents.

## What the AI does not do

- It does not decide anything. A person reviews and approves every extraction.
- It does not check documents against each other. Plain code in `packages/core` does that later.
- It does not classify goods or decide duty (not built yet).

## Output shape

Every field is `{ value, confidence, status, evidence }`:

- `value`: the text or number, or `null` when the document does not say.
- `confidence`: 0 to 1, reported by the model. It is a hint, not a measurement.
- `status`: `extracted`, `missing`, `uncertain` or `conflicting`. `missing` must have a `null` value.
- `evidence`: a short exact quote from the document, or `null`.

Invoices may also carry `total_net_weight` and `total_gross_weight` (both optional, omitted when the document does not state them).

Invoices and packing lists also have `lines` (one entry per product). The server rejects any output that does not match this shape exactly (extra keys, wrong types, bad status). Rejected output is not repaired. The document is marked `failed` and you can try again.

## Structured output

The request sends `generationConfig.responseSchema` (with `responseMimeType: application/json`), built by `apps/api/src/ai/responseSchema.js` from the same `DOCUMENT_FIELDS` list that feeds the prompt and the zod validator. It makes Gemini return exactly the listed keys, with the required ones present, `status` limited to the four values, `confidence` between 0 and 1, and `value` a string, a number or null.

Why `responseSchema` and not `responseJsonSchema`: the field names and supported features come from Google's [js-genai `types.ts`](https://github.com/googleapis/js-genai/blob/main/src/types.ts). `responseSchema` is the documented default (an OpenAPI 3.0 subset with `nullable`, `enum`, `required`, `minimum` and `maximum`). `responseJsonSchema` also allows `additionalProperties`, but Google says not all JSON Schema features are supported there and it is the fallback "if `response_schema` doesn't process your schema correctly". The subset cannot forbid extra keys, so the zod schema stays the final gate: it still rejects extra keys and never repairs.

When validation fails, the API log `document_extraction_failed` has a reason such as `Model output failed validation at fields: unrecognized_keys (total_volume)`. It holds the path, the issue code and (for unknown keys) key names that look like field names. It never holds document values.

## Evidence verification

The file itself (PDF, JPEG or PNG) is always sent to the model. The server also reads the PDF's text layer with a small built-in reader and checks whether it `looksReadable` (at least 20 characters, most of them letters, digits, spaces or common punctuation, and a fair share letters or digits).

- **Readable text:** the text is also put in the prompt, inside the delimited data block, as a hint about the same file. Decision: this makes the model copy evidence quotes exactly as they appear in the text, which is what the check below compares against. The prompt says the file is the source and the text may be incomplete. The text is untrusted data, like the file. The server checks that each `evidence` quote appears in the text (ignoring case and extra spaces). A quote that is not found marks the field `evidence_verified: false`, changes `extracted` to `uncertain` and lowers the confidence. The screen shows "Evidence not found: AI suggestion".
- **No readable text** (scans, images, garbled text layers, PDFs the small reader cannot decode): no text is sent, only the file. Nothing can be checked and `evidence_verified` is `null`. The screen shows "Not verifiable". Treat those values with extra care.

Sending the file every time means a bad text layer can no longer hide the real page from the model. The cost is a larger request for text PDFs.

After approval, the screen still shows each field's real original evidence result. The server never stores `evidence_verified` from a review body (it strips it). The page compares each approved value with the original AI output: an unchanged field shows its original label, and a field you edited shows "Edited by you".

## Prompt injection

Document text is untrusted data. The prompt says so, puts the text in a delimited block, gives the model no tools, and the output must pass the strict schema. The synthetic file `fixtures/documents/injection-invoice.pdf` contains an "ignore previous instructions" sentence to test this. The unit tests prove a misbehaving output is rejected. They do not prove a real model resists injection. That needs a real run, which has not been done.

## Cache

The server stores the SHA-256 hash of each file. If you upload a file with the same hash and type again, the earlier extraction is reused and no AI call is made. This saves quota.

## Choosing GEMINI_MODEL

Do not guess. Open [Google AI Studio](https://aistudio.google.com/), go to the rate limits (usage) page for your project, and read the exact model name and limits shown for your account. Put that name in `apps/api/.env` as `GEMINI_MODEL`. Limits differ by account and change over time, so this repo does not copy any numbers. Tell the team which models and limits you see.

Google's Firebase documentation says Gemini 2.5 models are being rerouted from 2026-12-01. The hackathon deadline is 2026-12-04, so check your chosen model name again the week before the demo.

## Free tier data use

On the free tier, Google may use prompts to improve its products. Upload only the synthetic files in `fixtures/documents/`. Never upload real invoices, customer names or personal data.

## Known limitations

- The PDF text reader is small and best effort. Many real PDFs will fall back to "not verifiable".
- The extraction job runs inside the API process. If the API restarts while a document is `processing`, press the read button again. Recovery of a stuck `processing` document relies on a per process guard, so it is only safe with one API instance. With several instances a started-at timestamp would be needed.
- A re-review pairs each line with its existing row by description (ignoring case and spacing), not by position. Paired rows keep their id, so HS suggestions and duty estimates (which cascade from `line_items.id`) are kept when a line above is removed or lines are reordered. A line whose description was edited counts as different goods: the old row is deleted, with anything that hangs off it, and a new row is inserted. Nothing writes HS suggestions or duty estimates yet, so this is only protection for later milestones.
- If a review save fails after line items changed, the server tries to undo the line item changes. The undo is best effort: a failed undo step is logged as `line_items_restore_failed` and is not retried. A deleted row that is put back gets its old id but not the dependent rows that were deleted with it.
- One document per type per shipment.
- Line items are shown but not editable on the review screen.
- Nothing here has been run against the real Gemini API yet.

## Known limits of the evidence check

Evidence quotes are checked against the text that the server's small PDF reader extracts, which is the same text the model sees. A deliberately crafted PDF could show a reviewer different text from what that reader finds, so "Found in the document" means "found in the extracted text", not "visible on the rendered page". The reviewer still approves every value.

## Cross-check does not use the AI

The cross-check (spec 04) never calls the AI. It reads only values a person approved on the review screen, so an AI mistake that was not corrected before approval can still produce a wrong finding or hide a real one. Severity comes from fixed rules in `packages/core/src/crosscheck/severity.js`. An optional AI explanation for ambiguous name differences (R7) is not built. If it is added, it may only fill the explanation text and must never change severity.

The demo PDFs `fixtures/documents/demo-*.pdf` are synthetic. How well Gemini reads them has not been measured.
