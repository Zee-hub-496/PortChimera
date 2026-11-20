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

Invoices and packing lists also have `lines` (one entry per product). The server rejects any output that does not match this shape exactly (extra keys, wrong types, bad status). Rejected output is not repaired. The document is marked `failed` and you can try again.

## Evidence verification

When the PDF has readable text, only that text is sent to the model, and the server checks that each `evidence` quote appears in it (ignoring case and extra spaces). A quote that is not found marks the field `evidence_verified: false`, changes `extracted` to `uncertain` and lowers the confidence. The screen shows "Evidence not found: AI suggestion".

When there is no readable text (scans, images, PDFs the small built-in reader cannot decode), the file is sent to the model directly and nothing can be checked. The screen shows "Not verifiable". Treat those values with extra care.

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
- The extraction job runs inside the API process. If the API restarts while a document is `processing`, press the read button again.
- One document per type per shipment.
- Line items are shown but not editable on the review screen.
- Nothing here has been run against the real Gemini API yet.
