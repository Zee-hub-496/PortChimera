# Milestone: cross-check inside the app

> **Historical note.** This guide was written during the sandbox sprint (Nov 17 to 21, 2026), before the first real runs of this part of the app. Its "not run" statements may be out of date. For current status see `docs/DAILY_PROGRESS.md` and `docs/E2E_CHECKLIST.md`.

The cross-checker (`packages/core/src/crosscheck/`) now runs inside the app. The API reads the **approved** values of a shipment's documents, runs the fixed rules, stores the findings in `discrepancies` and shows them on a new page. No AI decides anything here. The code and its plain-logic tests pass in the authoring sandbox. The sandbox could not run Express, zod, React, Vite, a browser, Supabase or the Gemini API, so **none of those have been run**. These steps check them on your Windows machine.

Where each step happens:

- **Kiro IDE (terminal and file editor):** commands and `.env` files.
- **Browser, `http://localhost:5173`:** the PortChimera web app.
- **Supabase website (your project in a browser):** SQL Editor and Table Editor.

## 1. Update the code and install (Kiro IDE, terminal)

```powershell
git pull
npm install
npm test
```

`npm test` should finish with no failures. If anything fails, copy the error text for the report (step 9).

## 2. Run migration 0002 once (Supabase website)

The migration `supabase/migrations/0002_discrepancy_finding_key.sql` only adds columns. It does not delete or change data. Run it **once**.

1. In Kiro IDE open `supabase/migrations/0002_discrepancy_finding_key.sql`. Press Ctrl+A, then Ctrl+C to copy everything.
2. Open [supabase.com/dashboard](https://supabase.com/dashboard) in your browser and open your PortChimera project.
3. In the left menu click **SQL Editor**.
4. Click **New query** (a blank editor opens).
5. Click inside the editor and press Ctrl+V to paste the SQL.
6. Click **Run** (bottom right, or press Ctrl+Enter).
7. You should see **Success. No rows returned**. If you see "column ... already exists", the migration already ran. Do not run it again.
8. To confirm: left menu **Table Editor**, table `discrepancies`. The columns `finding_key` and `category` should be there. Table `shipments` should show `cross_check_summary` and `cross_checked_at`.

## 3. Start the app (Kiro IDE, two terminals)

```powershell
npm run dev:api
```

Open a second terminal:

```powershell
npm run dev:web
```

Open `http://localhost:5173` in your browser and sign in as alice. Gemini must be set up as in `docs/MILESTONE_DOCUMENTS.md` (`GEMINI_API_KEY` and `GEMINI_MODEL` in `apps/api/.env`).

## 4. Check the evidence labels again (browser)

1. Create a shipment, open it, click **Documents**.
2. Upload `fixtures/documents/commercial-invoice.pdf` as the commercial invoice and click **Read with AI**.
3. Look at the labels under each field: "Found in the document", "Evidence not found", "Not verifiable". After you click **Confirm and approve**, the labels must still be there when the page reloads.

## 5. Upload and approve the demo set (browser)

Use a new shipment so the earlier invoice does not get in the way. All three files are synthetic and are in `fixtures/documents/`:

| Document type         | File                              |
| --------------------- | --------------------------------- |
| Commercial invoice    | `demo-invoice.pdf` (500 kg gross) |
| Packing list          | `demo-packing-list.pdf` (650 kg)  |
| Certificate of origin | `demo-certificate-of-origin.pdf`  |

For each one: upload, click **Read with AI**, wait for "Ready for your review", compare the values with the PDF, fix any mistake, click **Confirm and approve**. The AI may read a value wrongly. Fix it before approving, because the check only uses approved values.

## 6. Run the check (browser)

1. Open the shipment and click **Cross-check documents** (or click **Cross-check these documents** on the Documents page).
2. Click **Run the check**.
3. Expected result: **one** finding, severity **High**, field **Gross weight**, with the invoice value **500 kg** next to the packing list value **650 kg**, a difference of **150 kg (23.1% of the larger value)**, an explanation that says "possible inconsistency", and a recommended action that says "requires manual verification".
4. The summary should list what was compared, and what was not compared and why.
5. If you see more findings, read them. They are probably real differences in what the AI read. Compare with the PDFs and fix the approved values on the Documents page, then run the check again.
6. Before approving two documents, **Run the check** should say you need at least two approved documents.

## 7. Record a decision and re-run (browser)

1. Click **Accept** on the weight finding. Its label changes to "Accepted" and the buttons disappear.
2. Click **Run the check again**. The finding must still be there and still say "Accepted". It must not appear twice.
3. Supabase website, Table Editor:
   - `discrepancies`: one row, `review_status` = `accepted`, `reviewed_by` and `reviewed_at` filled, `finding_key` = `grossWeight|commercial_invoice+packing_list`.
   - `audit_logs`: `crosscheck.run` (twice) and `discrepancy.reviewed`.
4. Optional: on the Documents page change the packing list gross weight to 500 kg, approve, and run the check. If the compared values of an accepted item change, it is reopened (status "open", decision cleared) so it never shows figures that no document contains. An accepted item with unchanged values keeps its decision. A finding that is still **open** and no longer applies disappears.

## 8. Check privacy (private browser window)

1. Open a private window, go to `http://localhost:5173`, sign in as bob.
2. Bob must not see alice's shipment. Paste the address of alice's cross-check page (`/shipments/<id>/cross-check`). It should say "Shipment not found".

## Known limits (accepted for v1)

- **Not one transaction.** A re-run saves its changes as separate statements through the Supabase client, which has no multi-statement transaction. If one fails part-way, the list and the summary can disagree until the next run, which repairs it because it is computed from the stored rows. A database function would remove the window; it is left out of this student demo.
- **Overlapping runs.** The unique key `(shipment_id, finding_key)` stops duplicates. The run that loses gets a 409 "Another cross-check is running" and can be repeated.
- **Two documents of one type.** The newest reviewed one is used. Upload order decides, so approve only the document you want compared.
- **Decisions overwrite.** Two browser tabs deciding the same finding at once: the last one wins. The audit log records every change (`from` and `to`). No compare-and-set, since a single-user demo does not need it.
- **Rows from before migration 0002** have no `finding_key`. The tables were empty before 0002 in this project, so no cleanup is needed. If you have old rows, delete them in the Table Editor before the first run.

## Still to verify on your machine

These checks were written but never run, because the sandbox has no network, Express, zod or browser:

- Migration 0002 on a real Supabase project (step 2).
- The Express routes and zod validation: `POST /api/shipments/:id/cross-check`, `GET /api/shipments/:id/discrepancies`, `PATCH /api/discrepancies/:id`.
- The React page and the Vite build (`npm run build -w @portchimera/web`).
- Whether Gemini reads the three demo PDFs into the values the tests assume. The tests use hand-written approved values that match the PDFs.
- From `docs/MILESTONE_DOCUMENTS.md`: `fake-invoice.pdf` is rejected, `injection-invoice.pdf` does not change the extracted values, and bob gets a 404 on alice's documents.

## 9. Report back

Send the team:

- The output of `npm test` and `npm run build -w @portchimera/web`.
- Whether each step above worked, with any error text (never a key).
- The findings the check showed for the demo set, if they were not exactly the one weight finding.
