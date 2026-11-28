# PortChimera

Customs document checking and crisis-aware sea routing, built with Kiro for **Kiroween 2026 (Frankenstein category)**. Started on 2026-11-17.

**AI suggests. Deterministic rules verify. Humans approve. A\* adapts.**

## The problem

A shipment travels with an invoice, a packing list and a certificate of origin. They are written by different people and often disagree: a weight that differs by 150 kg, a country spelled two ways, a total that leaves out freight. Someone has to find those differences by reading three documents side by side, and then decide what to do when a port closes and the planned route is no longer usable.

## Who it is for

Small importers, exporters, freight forwarders and customs brokers' assistants who check shipping paperwork by hand. It is a student project with demo data, not a customs system.

## The Frankenstein concept

Three kinds of technology that normally live apart are stitched into one workflow:

1. **AI (Gemini)** reads the documents. Its output is only a suggestion, shown next to the quote it came from, and a person approves it.
2. **Deterministic code** compares the approved values and decides what is a possible inconsistency. The same inputs always give the same result. No AI is used in the comparison.
3. **A\* search** picks the fastest, cheapest or lowest-risk route over a graph of ports and lanes, and plans again when a port or lane is closed.

## Try it

- **Deployed app:** https://port-chimera.vercel.app (web, on Vercel) with the API at https://portchimera.onrender.com (Render free tier). The API sleeps when idle, so the first request after a pause can take about a minute. The web app starts waking it when a page opens. If something looks slow, wait a minute or open https://portchimera.onrender.com/api/health.
- **Demo documents:** `fixtures/documents/demo-invoice.pdf`, `demo-packing-list.pdf` and `demo-certificate-of-origin.pdf`. They agree on everything except gross weight: 500 kg on the invoice, 650 kg on the packing list. The cross-check reports that one difference. All documents are synthetic.
- **Run it yourself:** see "Run it".

## The workflow

1. Create a shipment (number, origin port, destination port).
2. Upload the three documents. File type is checked from the file content, not the name.
3. Gemini reads each one. Every value shows the quote it came from. A value whose quote does not contain it is flagged.
4. A person fixes any wrong value and approves the document.
5. Run the cross-check. Findings carry a severity and the values from each document. A person accepts, resolves or dismisses each one.
6. The shipment status follows from this: Submitted, AI processing, Requires review, AI pre-cleared. "AI pre-cleared" is an internal label, not a customs decision.
7. Open the Route tab, compare routes, then close a port or lane ("What if?") and see the re-route with the estimated change in time, freight cost and risk.

## What works

| Area                     | What it does                                                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Accounts and shipments   | Supabase sign-in. Each user sees only their own data (Row Level Security plus ownership checks in the API).                                                                                                              |
| Documents and AI reading | Upload PDF, JPEG or PNG (5 MB). Gemini extracts fields. Evidence quote per value. A person edits and approves.                                                                                                           |
| Cross-check              | Compares weights, values, parties, goods, dates and countries. Handles country aliases, `1.234` vs `1,234`, split product lines, and invoice freight and tax. A warning shows when approvals changed after the last run. |
| Routing and crisis       | A\* over 20 seeded ports and 30 two-way lanes (60 directed edges), with fastest, cheapest and lowest-risk objectives. Closing a port or lane re-plans the route. Scenarios are saved per user.                           |
| Alerts, Documents, Map   | Lists across all shipments with search, filters and pagination. A global map of ports and chokepoints.                                                                                                                   |
| Audit log                | Each state-changing action writes an entry that the user cannot edit or delete.                                                                                                                                          |

**Evidence (dates and who ran it are in `docs/DAILY_PROGRESS.md` and `docs/AUDIT_2026-11-28.md`):** GitHub Actions runs the secret scan, lint, format check, all tests and the web build on every pull request, and is green on `main`. The author ran the app checklist locally with real Supabase and Gemini (tag `v0.1.0-rc1`, per-step results were not written down). On 2026-11-28 the deployed API passed a 5-check smoke test, and ten database security checks passed on the real project. The checklist run against the deployed app, and HTTP-level security tests, are not recorded yet.

## Architecture

```
Browser (React, Vite, Tailwind, Leaflet)         https://port-chimera.vercel.app
   |  HTTPS, Bearer token
   v
Express API (zod validation, rate limits)         https://portchimera.onrender.com
   |  acts AS the signed-in user, so Row Level Security applies
   +--> Supabase Postgres (RLS), Auth, private Storage bucket
   +--> Gemini REST API (document reading only)
   +--> packages/core: A*, disruption overlay, cross-check, status rules (pure JS, no framework)
```

The AI never writes to the database directly and never decides anything. Its raw output is stored separately from what the person approved.

## Security measures

- Every API route except health requires a valid Supabase sign-in. The API uses a database client carrying the user's token, so Row Level Security applies, and also checks ownership in code.
- Uploads are validated by file content, limited to 5 MB, and rate limited. File names never become storage paths.
- A database trigger stops signed-in users from changing `shipments.status` directly. The API writes status with a service-role key that lives only in the host's environment settings and is used for that one write.
- The audit log has no update or delete policy for users.
- Document text is treated as data: AI output is schema-checked, and each value needs evidence that contains it. A fixture with a prompt-injection sentence is in the tests.
- CORS allows one origin. A secret scanner runs in CI. No keys are in the repository or the browser code.

## Known gaps

Read these before trusting the project with anything real.

- **Only shipment status is protected at the database level.** A signed-in user can still change their own documents' and findings' status, and add audit entries of their own with any content, by calling the Supabase REST API directly, because the API writes those tables as the user. That can only affect their own data and an internal status label. Closing it means moving those writes to the server, which was left out to avoid breaking the working flow. The database security checks passed on 2026-11-28; the same checks over HTTP (REST and Storage) have not been run yet. Details: `docs/AUDIT_2026-11-28.md`, `docs/DAY6_SECURITY_TEST.md`.
- **No customs, HS-code or duty module.** It is specified in `.kiro/specs/03-customs-classification` and was left out of scope.
- **AI reads can be wrong.** Gemini misread net weights on the demo invoice once. The review step exists for this. A unit change by the AI (0.45 tonnes written as 450 kg) is flagged as unsupported on purpose.
- **The free hosting sleeps.** The API sleeps when idle and a free Supabase project can pause. A keep-alive monitor is described in `docs/DEPLOYMENT.md`; it is an owner setup step and is not confirmed to be running.
- Document delete exists in the API only (`DELETE /api/documents/:id`), with no button in the web app. Replacing a document is not built.
- A console error from Leaflet (`reading 'save'`) appeared in some sessions. It has no visible effect and is not explained.
- Accessibility (Lighthouse), bundle size and a Playwright pass were not measured.

## Limitations that will stay true

- Port and lane data is **illustrative**, not live or quoted. Time, cost and risk figures are made up and marked as estimates in the app.
- Results are possible inconsistencies that need manual verification. They are not legal or customs advice.
- Demo documents are synthetic. Do not upload real customer documents: uploaded documents are sent to Google's Gemini API for reading.

## Run it

Requires Node 22 or newer, a Supabase project and a Google AI Studio key.

```bash
npm ci
cp .env.example apps/api/.env      # fill in the API section
cp .env.example apps/web/.env      # keep the VITE_ lines only
```

1. In Supabase, run the files in `supabase/migrations/` in order (`0001` to `0004`). Add `SUPABASE_SERVICE_ROLE_KEY` to `apps/api/.env` before running `0004`, otherwise shipment status stops updating. Setup notes: `docs/SETUP_SUPABASE.md`, `docs/DAY6_SECURITY_TEST.md`.
2. Set `GEMINI_API_KEY` and `GEMINI_MODEL` in `apps/api/.env`. Model names get retired; use one from your AI Studio page.
3. Start both servers in two terminals:

```bash
npm run dev:api     # http://localhost:4000
npm run dev:web     # http://localhost:5173
```

Other commands: `npm test`, `npm run lint`, `npm run format:check`, `npm run scan:secrets`, and `node scripts/smoke-test.mjs <api-url> <web-url>` for a deployed copy. Never commit `.env` files; keys belong in untracked `.env` files and in host dashboards.

## Repository layout

```
apps/web         React, Vite, Tailwind, Leaflet
apps/api         Express API (zod validation, Supabase client, Gemini REST provider)
packages/core    Framework-free logic: routing, disruption overlay, cross-check, status
supabase/        SQL migrations, seed data, security check script
fixtures/        Synthetic documents only
docs/            Setup, deployment, API notes, security test, audit, E2E checklist, Kiro usage, demo script
.kiro/           Specs and steering files used to build this with Kiro
```

## How Kiro was used

- **Specs** in `.kiro/specs/` (requirements, design, tasks) for each area, with task lists kept in step with what was built (`[x]` verified, `[-]` written but unverified, `[ ]` not started).
- **Steering** in `.kiro/steering/`: product rules (no accusations, AI is a suggestion, illustrative data is labelled), security, API, database and testing conventions.
- **A day-by-day plan and a progress log** (`docs/PORTCHIMERA_EXECUTION_PLAYBOOK.md`, `docs/DAILY_PROGRESS.md`) that carried context between sessions and record what was not verified.
- **Tests that must be able to fail:** engines were broken on purpose to confirm the tests notice (for example a heuristic that overestimates made 5 tests fail).
- Kiro was used both as Kiro Web (sandbox sessions that wrote the code) and as the Kiro IDE on the author's machine (cloned from the same GitHub repository, used to run the app and the tests locally and to push and pull).
- Kiro Web's sandbox could not install packages or reach Gemini and Supabase, so real runs were done on the author's machine and in CI. Details, including what was not used (hooks, custom agents, MCP): `docs/KIRO_USAGE.md`.

## License

MIT. See `LICENSE`.
