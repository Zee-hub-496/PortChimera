# Milestone: web login, shipments and route page

> **Historical note.** This guide was written during the sandbox sprint (Nov 17 to 21, 2026), before the first real runs of this part of the app. Its "not run" statements may be out of date. For current status see `docs/DAILY_PROGRESS.md` and `docs/E2E_CHECKLIST.md`.

This milestone adds a login page, a shipments page and a route page. The code is written but the pages have **not been run yet**. These steps check it.

## What was not verified before you start

- `npm install` (the new `@supabase/supabase-js` dependency is in `apps/web/package.json`, so `package-lock.json` changes when you install).
- The web build and the React pages in a browser.
- The Express routes and the zod schema tests (`apps/api/test/shipmentSchemas.test.js`).
- Sign in against a real Supabase project.
- Saving route results to the `route_results` table (not built).

## Before you begin

You need a Supabase project with the migration and seed data applied, and two users, `alice@example.com` and `bob@example.com`. See `docs/SETUP_SUPABASE.md`. Your `.env` files need `SUPABASE_URL` and `SUPABASE_ANON_KEY` for the API, and `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_API_URL` for the web app (see `.env.example`). Never commit these files.

## Manual verification (Windows PowerShell)

1. Open PowerShell in the project folder and install packages, then run the tests:

   ```powershell
   npm install
   npm test
   ```

   Expect every test to pass. If one fails, copy the message and ask for help before going on.

2. In the first PowerShell window, start the API:

   ```powershell
   npm run dev:api
   ```

3. Open a second PowerShell window in the same folder and start the web app:

   ```powershell
   npm run dev:web
   ```

4. Open <http://localhost:5173/login> in your browser.
5. Sign in as `alice@example.com` with the password you set in Supabase.
6. On the shipments page, create a shipment: number `SHP-001`, origin Shanghai (CNSHA), destination Karachi (PKKHI). It should appear in the list.
7. Click the shipment. The route page shows time, cost, risk, the list of stops and a sketch. The text "Illustrative data, not real freight rates" must be visible. Try the three "Optimize for" choices.
8. Copy the shipment's address from the browser bar (it looks like `http://localhost:5173/shipments/<id>`). Go back and click **Sign out**. You should land on the login page.
9. Sign in as `bob@example.com`. The shipments list must be empty.
10. Paste Alice's address into the browser bar. You must see "Shipment not found".

### Optional: check the 404 from the command line

Bob's access token is needed. In the browser developer tools, open Application, Local Storage, and find the `access_token` value (do not share it). Then:

```powershell
$token = "paste-bob-access-token-here"
$id = "paste-alice-shipment-id-here"
Invoke-RestMethod -Uri "http://localhost:4000/api/shipments/$id" -Headers @{ Authorization = "Bearer $token" }
```

PowerShell reports a 404 error with the code `SHIPMENT_NOT_FOUND`. That is the correct result: the API does not reveal that the shipment exists.

## If something goes wrong

- Blank page or "supabaseUrl is required": a `VITE_SUPABASE_*` value is missing. Restart `npm run dev:web` after editing the env file.
- Sign in works but lists fail with 401: the API's Supabase settings do not match the web app's project.
- Ports dropdown is empty: the seed data (`supabase/seed/routing_seed.sql`) has not been run.

## Review follow-ups

- Run `npm install` and commit the updated `package-lock.json` (new `@supabase/supabase-js`). The lockfile could not be regenerated in the sandbox, so `npm ci` fails until this is done. Then run `npm test` once: `shipmentSchemas.test.js` needs zod.
- Audit on create: the shipment insert and the audit write are not atomic. If the audit write fails, the API still returns the created shipment and logs `audit_write_failed`. Moving both into one database function is future work.
- Same origin and destination is now rejected by the API (422), not only by the web form.
- Incoterms and objectives are still listed in several places. Tests compare the web lists with the API and core lists, so drift fails a test.
