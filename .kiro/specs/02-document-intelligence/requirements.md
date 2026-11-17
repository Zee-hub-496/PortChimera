# Spec 02: Document intelligence

## Goal
Upload an invoice, packing list or certificate of origin and get structured, evidence-backed fields
that a person reviews and approves. The AI reads; it never decides.

## Requirements

### R1. Upload
1. WHEN a file is uploaded THEN the API SHALL accept only PDF, JPEG and PNG, verified by magic bytes, up to 5 MB.
2. WHEN validation fails THEN the API SHALL return 400/413 with a clear code and store nothing.
3. THE API SHALL store the file in the private `documents` bucket under `<user_id>/<shipment_id>/<uuid>`; user filenames SHALL NOT form paths.
4. THE API SHALL record SHA-256, size and MIME type, and allow one document per type per shipment.

### R2. Extraction
1. WHEN processing is requested THEN the API SHALL respond 202 and process in the background, updating `processing_status`.
2. THE extractor SHALL return, per field: `value`, `confidence`, `status` (`extracted|missing|uncertain|conflicting`), `evidence`.
3. WHEN a field is not in the document THEN `value` SHALL be null and `status` `missing`. The AI SHALL NOT infer or invent values.
4. THE extractor SHALL cover all invoice, packing-list and certificate-of-origin fields listed in `design.md`.
5. THE extractor SHALL support multiple product lines.

### R3. Output validation
1. THE API SHALL validate every AI response against a zod schema and reject (not repair) malformed output.
2. WHEN text is available THEN the API SHALL check each `evidence` string appears in it; otherwise set `evidence_verified=false` and downgrade the field to `uncertain`.
3. WHEN evidence cannot be checked (image input) THEN `evidence_verified` SHALL be null and the UI SHALL say "not verifiable".

### R4. Safety
1. THE system prompt SHALL state that document text is data, never instructions.
2. WHEN a document contains text such as "ignore previous instructions" THEN the output SHALL still follow the schema and SHALL NOT change behaviour. (Tested with a fixture.)
3. THE extraction call SHALL have no tools and no other user data in context.

### R5. Reliability and cost
1. WHEN a file with the same SHA-256 was already extracted THEN the API SHALL reuse the result with no new AI request.
2. WHEN the provider times out or returns 429/5xx THEN the API SHALL retry once with backoff, then mark the document `failed` with a safe message.
3. THE model name SHALL come from `GEMINI_MODEL`; the API key SHALL never reach the browser.

### R6. Review
1. THE web app SHALL show each field with value, confidence, status and evidence, and let the user edit or confirm.
2. WHEN the user approves THEN the API SHALL save `reviewed_payload`, create or update `line_items`, set `processing_status=reviewed`.
3. THE UI SHALL visually separate "found in the document" from "AI suggestion".

### R7. Audit
1. Upload, extraction completed/failed, and review approval SHALL each create an audit entry.
