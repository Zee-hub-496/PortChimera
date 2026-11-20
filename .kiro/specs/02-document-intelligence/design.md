# Spec 02 design

## Pipeline

```
upload (multer, memory) -> validate type/size/magic bytes -> sha256 -> Storage (user-scoped path) -> documents row
POST /api/documents/:id/process -> 202
   background job:
     cache hit by sha256?  -> reuse extraction
     else text = pdf-parse (text PDFs)   |  none for images/scans
          call provider.extract({ docType, text?, fileBytes, mimeType })
          zod-validate -> verify evidence against text -> save document_extractions.payload
GET  /api/documents/:id          -> status + payload (client polls)
PUT  /api/documents/:id/review   -> reviewed_payload + line_items
```

Why polling instead of websockets: simplest thing that works on free hosting, and an extraction takes seconds.

## Fields

- Invoice: invoice_number, invoice_date, exporter, importer, origin_country, destination_country, currency, total_value, incoterm (if present); lines: name, description, quantity, unit, unit_price, line_total, net_weight, gross_weight, country_of_origin.
- Packing list: exporter, importer, invoice_number (if present), lines: description, quantity, unit, net_weight, gross_weight; total weights.
- Certificate of origin: exporter, importer (if present), goods description, origin_country, invoice_number (if present), quantity/weight (if present).

Each field object: `{ value, confidence (0-1), status, evidence, evidence_verified }`. One zod schema per document type, versioned (`schema_version`).

## Provider abstraction

`ai/aiProvider.js` defines `extractDocument()` and `suggestHsCode()` (spec 03) and `explainDiscrepancy()` (spec 04).
`ai/geminiProvider.js` implements it. Tests use `ai/fakeProvider.js`. SDK package name and structured-output
options must be checked against Google's current docs when installing; do not rely on memory.

## Evidence verification

Normalize both strings (lowercase, collapse whitespace) and require the evidence to be a substring of the text.
This turns the model's "evidence" from a claim into something we checked. It is impossible for image input,
which is why that case is shown as "not verifiable" rather than hidden.

## Prompt-injection stance

Document text is placed in a clearly delimited block and the prompt says it is untrusted data. The real defence is
structural: no tools, strict schema, nothing else in context, and a human review step. The fixture
`fixtures/injection-invoice.txt` tests this.

## Upload hardening

Magic bytes: PDF `%PDF-`, JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`. Content-Type headers can be faked, so they are not trusted.

## Dependencies to add (check each is necessary)

Originally listed: `multer`, `pdf-parse`, the official Google GenAI SDK, `@supabase/supabase-js`.

**Decision as built: no new dependencies.** The sandbox cannot install packages, and each one is extra supply-chain surface.

- No `multer`: the upload is a raw binary body read by `express.raw` on one route (type in the query string, filename in `X-Filename`). The file type comes from magic bytes, not from the header or filename.
- No `pdf-parse`: a small built-in reader (`apps/api/src/ai/pdfText.js`, using `node:zlib`) extracts text from simple PDFs. When it finds too little text the file goes to the model directly and evidence is marked "not verifiable".
- No Google SDK: the Gemini REST endpoint is called with `fetch`, which keeps timeouts, retries and error messages under our control and testable with a fake fetch.
- `@supabase/supabase-js` was already added by spec 01.

## Risks

- Free-tier quota is small: cache by hash and test with fakes.
- Scanned or blurry files may give low-confidence fields; the UI must show that clearly.
