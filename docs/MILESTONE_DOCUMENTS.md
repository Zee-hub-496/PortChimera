# Milestone: document upload and AI extraction

The code for this milestone is written and its plain-logic tests pass in the authoring sandbox. The sandbox could not run Express, zod, React, Vite, a browser, Supabase or the Gemini API, so **none of those have been run**. These steps check them on your Windows machine.

No SQL is needed. `supabase/migrations/0001_initial_schema.sql` already has the tables and the `documents` storage bucket.

## 1. Create a Gemini key (website)

1. Open [Google AI Studio](https://aistudio.google.com/) and sign in.
2. Create an API key. Copy it. Never paste it into chat, a commit or a screenshot.
3. On the rate limits (usage) page, note the exact model names and limits your account shows.

## 2. Add the key (Kiro IDE)

1. Open `apps/api/.env` (it is git-ignored).
2. Add two lines, using a model name from step 1:

   ```
   GEMINI_API_KEY=your-key-here
   GEMINI_MODEL=model-name-from-your-ai-studio-page
   ```

3. In the terminal run `npm install` if you have not since the last pull, then restart the API: stop `npm run dev:api` with Ctrl+C and start it again. Start the web app with `npm run dev:web` in another terminal.
4. Run `node scripts/scan-secrets.mjs` to confirm no key is in tracked files.

## 3. Try it as alice (browser, localhost)

1. Sign in as alice, open a shipment, click **Documents**.
2. Upload `fixtures/documents/commercial-invoice.pdf` as the commercial invoice. Only use the synthetic files in that folder.
3. Click **Read with AI**. The status changes to "AI is reading the document..." and then "Ready for your review".
4. Check each field against the PDF. Look at the labels "Found in the document", "Evidence not found" and "Not verifiable". Edit one value and click **Confirm and approve**.
5. Click **Download original**. The PDF should open.
6. Also try `fixtures/documents/fake-invoice.pdf` (should be rejected as an unsupported file) and `fixtures/documents/injection-invoice.pdf` (read it and check the AI did not follow the injected sentence).
7. Without a key in `.env`, **Read with AI** should show the "not set up" message.

## 4. Try it as bob (private window)

Sign in as bob in a private window. Bob should not see alice's shipment or documents. Opening alice's shipment documents page should show "Shipment not found".

## 5. Check the data (Supabase website, Table Editor)

- `documents`: one row with status `reviewed`.
- `document_extractions`: the AI payload and your reviewed payload.
- `line_items`: rows for invoice lines after approval.
- `audit_logs`: `document.uploaded`, `document.extracted`, `document.reviewed`.
- Storage, bucket `documents`: one object under `<user id>/<shipment id>/`.

## 6. Report back

Send the team:

- The model names and rate limits from your AI Studio page, and which model you set.
- Any error text you saw (not the key).
- Whether each step above worked, and what the extraction got wrong.
- The output of `npm test` and `npm run build -w @portchimera/web`.
