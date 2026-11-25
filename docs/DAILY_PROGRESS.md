# PortChimera Daily Progress

Updated at the end of every session. Newest entry first. Only record what actually happened: if a test was not run, say so.

Plan reference: `docs/PORTCHIMERA_EXECUTION_PLAYBOOK.md`.

## Kiro credits

| Date       | Credits used (from Kiro dashboard) | Remaining   | Note                                                           |
| ---------- | ---------------------------------- | ----------- | -------------------------------------------------------------- |
| 2026-11-22 | about 250 (owner's figure)         | about 3,750 | Starting point before the sprint. Not measured by this session |

## Template for each day

```
## Day N: <date>, <title>

### Completed
-

### Pull requests
-

### Files changed
-

### Tests performed
- Command, result (real numbers), and anything NOT run.

### Unresolved bugs
-

### Blockers
-

### Next session's starting point
-
```

---

## Day 6: 2026-11-25 (started early), Database security and document lifecycle (in progress)

Branch `feat/day6-db-security`. Nothing here has run against a real Supabase project yet.

### Completed (code written; sandbox tests only)

- Migration `0004_protect_shipment_status.sql`: trigger `shipments_protect_status` rejects a change of `status` (and an insert with a status other than `submitted`) when the session role is `authenticated` or `anon`. `service_role` and the SQL Editor (`postgres`) are allowed. Rollback is in the file.
- API: `createStatusWriterClient` (service-role key) in `config/supabase.js`, used only by `syncShipmentStatus` for the single `update({ status })`; ownership is still checked first with the user's client. `server.js` sets it at startup. In production the API now refuses to start without `SUPABASE_SERVICE_ROLE_KEY`.
- `DELETE /api/documents/:id`: removes the stored file first, then line items from that document (the foreign key would only null them), the findings that compare that document type (any review state), clears the shipment's cross-check summary, deletes the document (extraction cascades), audits `document.deleted`, re-derives status. 409 while the document is being read. Safe to repeat after a failure.
- `supabase/checks/day6_security_checks.sql` (database checks, PASS/FAIL lines) and `docs/DAY6_SECURITY_TEST.md` (REST, Storage and app checks with two accounts, PowerShell).

### Tests performed

- `apps/api/test/documentDelete.test.js`: 8 tests, pass (delete cascade, other user gets 404 and nothing changes, busy document, storage failure keeps the row, repeat after failure, status written through the writer and never by the signed-in client, no writer call for someone else's shipment).
- Existing status sync (10), documents API (53), cross-check API (23), audit (5) still pass. `prettier --check` and `scan:secrets` pass.
- NOT run: suites that need zod/express (including the new `envProduction` test for the service key), eslint, a browser, and anything against a real database. The trigger SQL and the SQL checks are unexecuted.

### Open decision (needs the owner)

Option A only protects `status`. The API writes every other table as the signed-in user, so a user can still, through REST, set `documents.processing_status`, `discrepancies.review_status`, `shipments.cross_checked_at` and insert any `audit_logs` row of their own. Closing that means moving those writes to the service-role client (or SQL functions), which widens the service-key use beyond the approved "status only". Options: (1) accept for the hackathon and document it; (2) move cross-check, decision and review writes server-side. Not done.

### Not done

- Replace document (optional in the plan). No web button for delete yet (API only).
- Tighter policies on `documents`, `document_extractions`, `discrepancies`, `audit_logs` (see open decision).

### Next session's starting point

Owner runs `docs/DAY6_SECURITY_TEST.md` and reports the output; then decide the open question above.

---

## Day 5: 2026-11-24 (started early), Document intelligence and cross-checking

Two PRs. Each fix started with a failing test.

### Completed

PR 1 (core, #28): cross-checker false positives.

- Country aliases (Deutschland, Italia, Espana, Nederland, P.R. China; accents folded). Different countries still high.
- Ambiguous numbers (1.234 vs 1,234): compared under every reading; no finding when any reading agrees, a high finding with a note when none do. `500,000 g` vs `500 kg` still matches.
- One product listed on several lines of one document is added up before comparing. A real quantity gap is still found.
- Invoice total = lines + itemized freight, insurance, tax - discount. Without itemized charges a gap is medium and says it may be freight etc. (it was high). With itemized charges it stays high.
- Invoice date compared across documents (numeric dates read both ways).

PR 2 (this branch): extraction fields, evidence, UI, stale check.

- Schema version 3: optional `freight_charges`, `insurance_charges`, `tax_amount`, `discount_amount` on the invoice, optional `invoice_date` on the packing list and certificate. Mapped into the cross-check. Prompt gives a one-line meaning for each.
- Evidence now has to show the value, not just exist: `evidence_verified: 'unsupported_value'` when the quote is in the document but does not contain the value (formatting, dates, countries and currencies are tolerated). Status becomes uncertain, confidence at most 0.5. The review screen says "The quote is in the document but does not show this value".
- Stale cross-check: `GET /shipments/:id/discrepancies` and the run response return `stale`. True when a review was saved after the run or the approved set changed. The Cross-check page shows a warning and the run button. `isCrossCheckStale` is in core.

### Behaviour changes to know about

- `invoiceTotalVsLines` without itemized charges is medium, not high.
- Documents extracted before this change have schema version 2; they still work, the cache just will not reuse them (a re-run reads the new fields).

### Not done

- The review screen shows no totals arithmetic hint.
- A lane/weight unit conversion by the AI (for example 0.45 tonnes written as 450 kg) is flagged as unsupported, on purpose.
- Not run here: zod and Express based tests (no packages in the sandbox), full lint, the UI in a browser. CI runs them.

## Day 4: 2026-11-24 (started early), Crisis simulation frontend (in progress)

### Completed (PR from `feat/day4-scenario-ui`)

- Route page (`/shipments/:id/route`): new "What if?" panel (`ScenarioPanel.jsx`) to close a port or a lane, reopen it, switch between saved scenarios, delete one, or reset to the original route. Every change re-runs `POST /api/scenarios/:id/simulate`.
- `SimulationSummary.jsx`: status banner, the API's deterministic explanation, original and rerouted path, before/after cards for time, cost and risk with the change, and the illustrative label. Handled states: rerouted, unaffected, no alternative, origin closed, destination closed, no original route; loading, saving and error with "Try again".
- Map shows the original route, the rerouted route, closed lanes as blocked legs and closed ports as warning rings.
- New read-only `GET /api/ports/network` (ports and lanes with ids), because the UI needs ids to name what it closes. No migration.
- Pure logic in `lib/scenarioView.js` with 20 tests (pass); 3 API tests for the network endpoint (pass).

### Not done

- The Playwright run at 1280px and 390px with saved screenshots is NOT done: React and Vite cannot be installed in this sandbox and the app needs Supabase sign-in. Needs to be run on the owner's machine.
- The UI itself has not been rendered or clicked through anywhere yet. Syntax and the lint rules that can run here pass; CI runs the build.
- A lane effect closes one direction only; there is no "both directions" shortcut.

## Day 3: 2026-11-24 (started early), Crisis simulation backend (in progress)

### Completed (PR from `feat/day3-scenarios`)

- New module `apps/api/src/modules/scenarios/` (schemas, view, service, handlers, routes), mounted at `/api/scenarios` behind sign-in. Endpoints and result shape: `docs/API_SCENARIOS.md`.
- No migration needed: `disruption_scenarios`, `scenario_effects` and `route_results` from 0001 are enough. Limit: `route_results` cannot hold a "no route" outcome (its totals are NOT NULL), so those outcomes are returned and audit-logged, not stored.
- Uses core's `simulateDisruption` unchanged. Unknown ports and lanes give 422. Deleting a scenario first deletes its route results, because the foreign key would otherwise turn them into baseline rows.
- 27 tests in `apps/api/test/scenarios.test.js` (pass in the sandbox), plus schema and router tests in `scenarioSchemas.test.js` (need zod; not run here).

### Not done

- Full suite, lint and CI not run here (no zod, express or eslint in the sandbox). CI will run them.
- Frontend is Day 4.

## Day 2: 2026-11-24, Deployment and reliability (in progress)

### Completed (code written, not run)

- `app.set('trust proxy', TRUST_PROXY_HOPS)`, default 1; `createApp` takes `rateLimitMax` so tests can lower the limit. Tests added in `apps/api/test/app.test.js` for per-client rate-limit keys and for spoofed `X-Forwarded-For` prefixes.
- `.github/workflows/ci.yml`: secret scan, lint, format check, test, web build.
- `apps/web/vercel.json` (SPA rewrite), `render.yaml`, `docs/DEPLOYMENT.md` (click-by-click steps).
- `scripts/smoke-test.mjs` for the deployed API. `/api/health` already existed and is covered by `app.test.js`.
- `GEMINI_MODEL`: web search found no shutdown date for `gemini-3.5-flash-lite` (deprecations page snippets and third-party trackers say "no shutdown date announced"). Google's pages returned 403 to the fetch tool, so this is not read from the official page directly.

- ESLint React plugins added after CI failed on 205 false "unused" errors (PR #24 merged, CI green, 618 tests pass locally).
- Stuck documents (PR from `feat/day2-stuck-documents`): migration `0003_documents_processing_started_at.sql`; `markProcessing` stamps it; `failStaleDocuments` marks a document `failed` when it is read while `processing`, not running in this process, and older than 2 minutes (or has no timestamp). It uses the caller's own client, so no service-role key. This replaces the playbook's "startup sweep", which would need the service-role key at boot (approved only for the Day 6 status write). Tradeoff: a stuck document is fixed when someone opens it, not at boot.

### Not done

- Deployment: on hold (no card for Render or Vercel). The hackathon needs a live URL, so a card-free host is still to be chosen.
- Render's proxy hop count could not be confirmed from Render's docs (403). 1 is assumed; verification steps are in `docs/DEPLOYMENT.md`.

### Tests performed

- None. `node_modules` is not installed in this sandbox. Owner to run `npm ci && npm test && npm run lint && npm run format:check`; CI will do it on the PR.

## Day 1: 2026-11-22 (session run on Nov 22 for the Nov 23 plan), core correctness

Branch: `feat/day1-core-correctness`. Started from `main` at `c761043` (PRs #19 and #20 merged, working tree clean, level with `origin/main`).

### Environment limits in this session (read first)

- The sandbox network is `INTEGRATIONS_ONLY`. `npm install` fails with `403 Forbidden` for every package (`express`, `react`, `zod`, `eslint` all tested). So `node_modules` could not be installed.
- Because of that: no ESLint run, no web production build, no browser/Playwright test, no real Gemini call (Gemini host unreachable), no Supabase SQL check. None of these were run. They need to be done on the owner's machine or in CI.
- To run API tests that import `@portchimera/core`, a local symlink `node_modules/@portchimera/core -> packages/core` was created (what `npm install` does for workspaces). `node_modules` is git-ignored.

### Completed

- **Task 1, baseline** (see numbers below).
- **Task 7, shipment status derivation:** new pure function `deriveShipmentStatus` in `packages/core/src/shipment/status.js`. New `syncShipmentStatus` in `apps/api/src/modules/shipments/statusSync.js`, called after upload, extraction start, extraction finish or failure, document review, cross-check run, and discrepancy decision. Failures are logged and never undo the user's action. Each change is audited as `shipment.status_changed` (from, to). `cleared` is never derived and never overwritten.
- **Dashboard:** counts already came from the stored `status`, which is now truthful. Replaced the always-zero "Cleared" tile with "AI pre-cleared" (hint: internal label, not customs clearance). The "Cleared" badge only shows if a shipment has that status.
- **Task 9, error boundaries:** `ErrorBoundary` component. Root level in `main.jsx`; page level in `AppLayout.jsx` (sidebar and header stay usable; navigating clears the error). Helper `describeCrash` is unit-tested. The component itself was not rendered (no React install).
- **Task 6, diagnostics:** retry on timeout/429/5xx already existed and is tested. Added: an upstream 4xx now logs `HTTP <code>, <GOOGLE_STATUS>` (for example `HTTP 404, NOT_FOUND` for a retired model), never the message text. Zod validation issues already log path only.
- **Task 8, design only:** `docs/DESIGN_STATUS_PROTECTION.md`. Key finding: the API writes as the signed-in user, so the database cannot tell an API write from a forged REST write. Needs the owner's decision (Option A or D).
- **Docs:** `.kiro/steering/architecture.md` module layout now matches the code (no `controller.js` / `repo.js`).

### Status rules implemented (for the owner to confirm)

| Situation                                                                   | Status                                 |
| --------------------------------------------------------------------------- | -------------------------------------- |
| Any document being read by AI                                               | `ai_processing`                        |
| Any document extracted and waiting for approval                             | `requires_review`                      |
| Not all three required document types approved (includes none, failed)      | `submitted`                            |
| All approved, cross-check never run, or an approval is newer than the check | `requires_review`                      |
| Cross-check has an open discrepancy                                         | `requires_review`                      |
| All approved, check is current, no open discrepancy                         | `ai_pre_cleared` (internal label only) |

### Not done on Day 1 (needs the owner or a machine with network)

- Task 2 RLS/policy SQL check: the query must be run in the Supabase SQL Editor (not run).
- Task 3: GitHub "MIT License" detection and the 2026 Devpost rules (not checked; no GitHub web access from here).
- Task 4, Gemini model: official Google pages returned 403 to the fetch tool. Search results (third-party summaries quoting Google's models page) say Gemini 2.5 Flash and Pro are scheduled to be rerouted on 2026-12-01, and that Google recommends `gemini-3.8-flash` or 3.5 Flash-Lite for new projects. `GEMINI_MODEL` was NOT changed (it is an env var, not code). The owner must confirm the exact model code on the AI Studio page and set it in `apps/api/.env` and in Render.
- Task 5, real Gemini run on the three synthetic PDFs: not run (no network from the sandbox, and the key must stay local).
- Task 6 cache versioning: not changed. `SCHEMA_VERSION = 2` already gates cache hits; no change was needed from what was inspected.

### Pull requests

- https://github.com/Zee-hub-496/PortChimera/pull/21 (open, not merged).

### Files changed

- Added: `packages/core/src/shipment/status.js`, `packages/core/test/shipmentStatus.test.js`, `apps/api/src/modules/shipments/statusSync.js`, `apps/api/test/shipmentStatusSync.test.js`, `apps/web/src/components/ErrorBoundary.jsx`, `apps/web/src/lib/crashInfo.js`, `apps/web/test/crashInfo.test.js`, `docs/DESIGN_STATUS_PROTECTION.md`.
- Modified: `packages/core/src/index.js`, `apps/api/src/modules/documents/{service,handlers,processJob}.js`, `apps/api/src/modules/crosscheck/service.js`, `apps/api/src/ai/geminiProvider.js`, `apps/api/test/documents/documentsApi.test.js`, `apps/api/test/ai/geminiProvider.test.js`, `apps/web/src/main.jsx`, `apps/web/src/layouts/AppLayout.jsx`, `apps/web/src/pages/Dashboard.jsx`, `apps/web/test/overviewStats.test.js`, `.kiro/steering/architecture.md`, `docs/DAILY_PROGRESS.md` (also Prettier-formatted, it already failed the format check on `main`), `docs/PORTCHIMERA_EXECUTION_PLAYBOOK.md` (Prettier whitespace only).

### Database migrations

- None. No migration was written or applied.

### Tests performed (all are automated `node:test` with a fake database; no real Supabase, Gemini or browser)

Baseline on `main` (before changes), run per group because the API group cannot fully load:

| Group          | Tests | Pass | Fail | Note                                                                             |
| -------------- | ----- | ---- | ---- | -------------------------------------------------------------------------------- |
| core + scripts | 190   | 190  | 0    |                                                                                  |
| api            | 203   | 198  | 5    | `ERR_MODULE_NOT_FOUND` for `express` / `zod` (not installed). Not a code failure |
| web            | 147   | 147  | 0    |                                                                                  |
| **Total**      | 540   | 535  | 5    | The audit's "about 540" figure matches                                           |

After changes:

| Group          | Tests | Pass | Fail |
| -------------- | ----- | ---- | ---- |
| core + scripts | 213   | 213  | 0    |
| api            | 218   | 213  | 5    |
| web            | 151   | 151  | 0    |
| **Total**      | 582   | 577  | 5    |

- The same 5 API suites fail as in the baseline (`extractionSchema`, `app`, `authRoutes`, `envProduction`, `shipmentSchemas`), all because `express` / `zod` cannot be installed here. They must be run in CI or locally.
- New tests: 23 core (every status transition, approval revoked, all discrepancies resolved, stale check, input validation), 10 API status-sync (ownership, error handling, cleared preserved, full mismatch and consistent flows), 3 API document-flow status checks, 2 Gemini 4xx diagnostics, 3 `describeCrash`, 1 dashboard count consistency.
- `npm run scan:secrets`: passed (278 files).
- `prettier --check`: run on touched code and docs, see the PR for the final result.
- NOT run: `eslint` (missing `@eslint/js`), `vite build`, browser tests at 1280px and 390px, real Gemini, real Supabase, two-user isolation against a real database.

### Owner-run checks on Windows (Node 22, Prettier 3.10.1), branch `feat/day1-core-correctness`

- `npm test`: **615 tests, 615 pass, 0 fail** (the 5 suites that could not load in the sandbox load and pass here; that is why the count is higher than the sandbox's 582).
- `npm run build -w @portchimera/web`: built. Warning: `index` chunk is 828 kB (over 500 kB). Already planned for Day 7.
- `npm run format:check`: passed, after `git restore .` re-created 40 files that still had CRLF line endings from a checkout made before `.gitattributes` existed. No content changed.
- `npm run lint`: 208 errors. 2 were real unused variables in test files (fixed in commit `a357094`). The other 206 are false positives: `eslint.config.js` has no React/JSX support, so every component used only in JSX looks unused, plus one unknown `react-hooks/exhaustive-deps` rule. This predates Day 1. Fix needs `eslint-plugin-react` and `eslint-plugin-react-hooks` (new dev dependencies, owner approval pending).
- **Real end-to-end status flow (owner, local app, real Gemini, real Supabase, new user, demo PDFs):** shipment `DEMO-001` (CNSHA to PKKHI) went Submitted -> AI processing -> Requires review -> (3 approvals) -> Requires review -> cross-check -> Requires review (1 High finding: gross weight 500 kg vs 650 kg, 23.1%) -> Resolve -> **AI pre-cleared**. Dashboard: Total 1, Requires review 0, AI pre-cleared 1, badges match. Checked at desktop and at iPhone 16 width (393 px): layout fine. Screenshots shared in chat, not saved to the repo.
- **AI reading error seen:** Gemini returned wrong net weights on the demo invoice and packing list. The owner corrected them in review to the printed values (200 kg and 250 kg per line). After that, net weight was compared with no finding (invoice has no printed total net, so the line sum 450 kg was compared with the packing list total 450 kg). Exact AI values not yet recorded. Input for Day 5 (evidence must support the value).
- **Console error seen:** `Uncaught TypeError: Cannot read properties of undefined (reading 'save')` from `leaflet.js`, shown while on the Dashboard after using the device toolbar. Dashboard has no map, so it most likely comes from a Leaflet canvas map (`MaritimeMap.jsx`, unchanged by Day 1) being removed or resized during an animation. Not reproduced yet; no visible effect. Open issue.
- **Error boundary (owner, local browser, iPhone 16 width 393 px):** a temporary `throw new Error('test crash')` in `Settings.jsx` showed the page-level fallback card ("This page hit an unexpected problem", Try again, Go to dashboard) with the header still usable, not a white screen. Console showed React handing the error to `ErrorBoundary` and the `ui_crash` log with name and message only. The test line was not committed.
- The Leaflet `reading 'save'` console error appeared 3 more times during this session. Still open.
- Not yet done by the owner: Supabase RLS queries, AI Studio model names, GitHub license, Devpost rules.

### Unresolved bugs

- Everything in playbook section 6 for Days 2 to 7 is still open.
- Status cannot yet be protected in the database (design pending approval; ships Day 6).
- Status is recomputed by separate reads and one write, so two events at the very same moment can leave an older result until the next event. Low risk; documented in the code.
- Shipments created before this change still show `submitted` until their next event (upload, review, cross-check, decision).
- `product.md` steering still says "17-day MVP", "seven pages" and lists a crisis page as out of scope. Not edited; needs the owner's decision.

### Blockers

- None for Day 2 code. The Kiro Web sandbox cannot install npm packages or reach Gemini/Supabase, so every install, lint, build, browser and real-API check is run by the owner on Windows (`D:\KIRO\PortChimera`). Day 2 CI will take over the install/test/lint/build part.

### Day 1 close-out (PR #21 merged 2026-11-23 14:12 UTC as `c8b9bc9`)

- Day 1 acceptance criteria met and verified by the owner: tests green (615/615), status moves through every state with real data, dashboard counts match, error boundary shows a recoverable fallback.
- **Owner decisions (2026-11-23):**
  1. Status protection: **Option A approved** (service-role key on the server only, for the single status write). Ships Day 6. `docs/DESIGN_STATUS_PROTECTION.md` updated.
  2. `GEMINI_MODEL`: owner's working local value is **`gemini-3.5-flash-lite`** (the model that extracted the three demo PDFs). Use the same value in Render on Day 2. Not yet confirmed against Google's official deprecation page; Day 2 should re-check it with a web search.
  3. `product.md` steering: **updated** (sprint scope, crisis simulation in scope on the route page, HS-code module out of scope, real page list).
  4. ESLint React plugins: **not answered yet**. Ask at the start of Day 2; CI lint depends on it.
  5. Optional note on High/Critical decisions: not answered yet.
- **Owner checks still open:** Supabase RLS queries (tables with RLS off; `shipments` policies), GitHub "MIT license" detection, Devpost 2026 rules, the exact wrong net weights Gemini returned.
- **Safety note:** during testing the owner edited `apps/web/src/pages/Login.jsx` to show a personal login and password. This was not committed and was restored. Never commit real credentials; a demo account is a Dec 3 decision.

### Next session's starting point

1. Start from an updated `main` (Day 1 PR #21 and this close-out PR merged).
2. Ask the owner about the ESLint plugins (needed for CI lint) and the optional decision note. `GEMINI_MODEL` and status protection are decided.
3. Day 2 tasks from the playbook: GitHub Actions CI; `app.set('trust proxy', 1)` with a rate-limit test (check Render's proxy hop count); `/api/health` smoke test; startup sweep for documents stuck in `processing` (additive migration for `processing_started_at`, needs owner approval); Vercel (`vercel.json` SPA rewrite) and Render (`render.yaml` or documented settings); env vars in dashboards only; CORS set to the Vercel URL.
4. Deployment steps happen in the owner's Vercel, Render and Supabase dashboards. Give click-by-click instructions; never ask for secrets in chat.

---

## Project HQ setup: 2026-11-22

### Completed

- Read the repository: README, all `docs/`, all `.kiro/steering/` files, migrations, API and web structure.
- Spot-checked audit findings against the code (results in playbook section 6).
- Created `docs/PORTCHIMERA_EXECUTION_PLAYBOOK.md`, `docs/DAILY_PROGRESS.md`, `.kiro/steering/09-kiroween-execution.md`.
- No application source code, migration or existing steering file was changed.

### Pull requests

- Documentation-only PR from branch `docs/hq-execution-playbook` (link added after creation).

### Files changed

- Added: `LICENSE` (MIT), `docs/PORTCHIMERA_EXECUTION_PLAYBOOK.md`, `docs/DAILY_PROGRESS.md`, `.kiro/steering/09-kiroween-execution.md`.

### Tests performed

- None. `node_modules` is not installed in this workspace, so `npm test` was not run. Baseline is a Day 1 task. The "about 540 tests" figure is from the audit and is unverified.

### Findings confirmed in code (details in playbook)

- No shipment status writes; no React error boundary; no scenario API or UI; no `trust proxy`; in-memory `activeJobs` set; no document delete/replace route; no CI or deploy config.
- Shipment owners can update any column of their shipments through Supabase REST (RLS policy allows it).
- No `LICENSE` file.

### Unresolved bugs

- All items in the playbook section 6 table not yet fixed.

### Blockers

- None open. Owner confirmed: MIT license (holder `Zee-hub-496`); migrations 0001 and 0002 applied (16 tables, 0002 columns present); Gemini key set locally and extraction of all three PDFs works (owner-reported).

### Next session's starting point

Day 1 (Nov 23). Day 1 also runs the read-only RLS check: list tables with RLS off (expect none) and the `shipments` policies (expect `shipments_owner_update`, the known gap). Start with: `npm install`, `npm test`, record the baseline, then follow the Day 1 task list in the playbook.
