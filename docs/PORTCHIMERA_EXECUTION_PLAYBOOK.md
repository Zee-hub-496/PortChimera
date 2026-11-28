# PortChimera Execution Playbook

Single source of truth for the Kiroween 2026 sprint. Every session (Project HQ or daily) starts by reading this file, `docs/DAILY_PROGRESS.md` and `.kiro/steering/09-kiroween-execution.md`.

- **Project:** PortChimera. Category: Frankenstein.
- **Deadline:** December 4, 2026, 2:00 PM Pacific Time. Submit on the morning of Dec 4 at the latest. Target: submit Dec 3 evening if everything is ready.
- **Statement:** "Read with AI. Verify with rules. Reroute with algorithms."
- **Owner:** one student developer, working through Kiro Web. Explanations must be in plain language.
- **Last reviewed:** 2026-11-22 (Project HQ session). **Status on 2026-11-28:** Days 1 to 8 are done and the project is in the submission phase. The day-by-day sections below are the original plan and are not updated; the current status, evidence and next steps are in `docs/DAILY_PROGRESS.md` ("Current state") and `docs/AUDIT_2026-11-28.md`.

> Claims in this file marked **[audit]** come from the Nov 22 engineering audit. Rows marked **[checked]** were re-verified against the code on 2026-11-22. Anything marked **[unverified]** must be re-checked in code before work starts.

---

## 1. Project overview

PortChimera combines three kinds of technology:

1. **AI (Gemini)** reads trade documents (invoice, packing list, certificate of origin) and returns a _suggestion_.
2. **Deterministic rules** compare human-approved data across documents and flag possible inconsistencies.
3. **A\* search** finds maritime routes and re-plans them when a port or lane is disrupted.

What it is not: a customs clearance system, a live shipping tracker, or a source of real freight quotes. Ports, lanes, costs and times are illustrative and must be labeled that way.

## 2. Architecture

Modular monolith in an npm-workspaces monorepo.

```
apps/web        React 19, Vite 6, Tailwind 4, React Router 7, Leaflet   -> Vercel
apps/api        Express 5, Zod, Supabase client, Gemini REST via fetch  -> Render
packages/core   Pure JS: A* routing, disruption overlay, cross-check
supabase/       SQL migrations (0001 to 0004) and seed data
fixtures/       Synthetic documents only
scripts/        Seed generation, secret scanner, demo scripts
docs/           This playbook, progress log, setup, AI notes, Kiro usage
.kiro/          Steering and specs
```

Rules that do not change without the owner's approval:

- `packages/core` imports no React, Express, Supabase, Gemini or network code.
- Web calls API over HTTP. Web never makes business decisions.
- API uses the signed-in user's JWT so Row Level Security applies. The service-role key is for seeding and signing storage URLs only, and is not used at all today.
- Disruptions are per-user scenario overlays applied in memory. Shared `ports` and `shipping_edges` are never modified.
- Shipment status is **derived** from state, not hand-edited.
- Real code layout inside an API module today is `routes.js`, `handlers.js`, `service.js`, `schemas.js` (plus feature helpers). Older steering text mentions `controller.js` and `repo.js`; the code is authoritative.

### Data flow

```
PDF upload -> API validates (magic bytes, size) -> private Storage
 -> background job: PDF text -> Gemini (JSON schema) -> Zod validation -> evidence check
 -> human reviews and approves fields
 -> approved data only -> core cross-check -> discrepancies table -> human decisions
 -> shipment status derived from documents + discrepancies
Route planner: ports/edges -> core A* (+ per-user disruption overlay) -> route_results
```

## 3. Product principles (non-negotiable)

1. No decorative UI. Every meaningful button has a real outcome.
2. `packages/core` stays independent of React, databases, Gemini and network.
3. AI never makes a final business decision.
4. Only human-approved extraction data enters the cross-checker.
5. Never invent document information. Missing is `missing`.
6. Strict request and response validation (Zod, reject unknown fields).
7. Never claim customs clearance. "AI Pre-Cleared" is an internal label only. Use "possible inconsistency" and "requires manual verification", never "fraud".
8. Illustrative costs, times, ports and exchange rates are labeled illustrative, never presented as quotations.
9. Strict per-user data isolation.
10. Migrations are additive and reversible where possible.
11. Never weaken a security policy for convenience.
12. No unnecessary dependencies; do not replace the stack without a real technical reason.
13. Every significant change has tests and written acceptance criteria.
14. No regressions: `npm test` must stay green.

## 4. Engineering conventions

Summary only. The detailed rules live in `.kiro/steering/` (`conventions.md`, `api.md`, `database.md`, `testing.md`, `security.md`, `ai-integration.md`) and are not repeated here.

- JavaScript ES modules, JSDoc on exports, Prettier + ESLint.
- API responses: `{ data }` or `{ error: { code, message } }`. Use `AppError`.
- Tests: `node:test`. A bug gets a failing test first, then a fix.
- Git: one branch per task, small commits, a pull request into `main`, no direct commits to `main`.
- Branch names: `feat/...`, `fix/...`, `docs/...`, `chore/...`.
- Run before every PR: `npm test`, `npm run lint`, `npm run format:check`, `npm run scan:secrets`.

## 5. Security rules

Authoritative detail is in `.kiro/steering/security.md`. Sprint-specific additions:

- Secrets only in untracked `.env` files and host dashboards. Never in chat, commits, logs, docs or screenshots.
- Only synthetic documents go to Gemini.
- Two-user isolation test is required for every new table, route and storage path.
- RLS is the second wall, not the only wall. Code checks stay.
- **Known gap [checked]:** policy `shipments_owner_update` in `0001_initial_schema.sql` lets a user update any column of their own shipment (including `status`) directly through Supabase REST. Likewise `discrepancies`, `documents`, `document_extractions` and `audit_logs` inserts are open to the owner. Day 1 designs the fix, Day 6 ships it.
- Rate limiting: `express-rate-limit` is present; `trust proxy` is **not set** [checked]. Behind Render, all users may share one IP bucket. Fixed on Day 2.

## 6. Verified state of audit findings (2026-11-22)

| Finding                                        | Status after code check                                                                                                                | Planned day |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Shipment status never updated                  | **Fixed Day 1 (PR #21).** Derived by `deriveShipmentStatus` in core, synced by the API; owner verified with real data                  | 1           |
| Dashboard counts misleading                    | **Fixed Day 1 (PR #21).** Counts come from derived status; "Cleared" tile replaced by "AI pre-cleared"; owner verified                 | 1           |
| Gemini schema fix unverified on real API       | **Owner verified Day 1:** all three demo PDFs extracted with the real API. Gemini misread net weights (corrected in review); see Day 5 | 1           |
| Not deployed                                   | [checked] no `.github/`, no Vercel/Render config in repo                                                                               | 2           |
| Crisis simulation has no API/UI                | **[checked] confirmed.** Core has `simulate.js`, `disruptions.js`; no scenario module in API or web                                    | 3, 4        |
| Evidence check only tests quote existence      | [unverified] see `ai/evidence.js`                                                                                                      | 5           |
| Freight charges cause false high discrepancies | [unverified]                                                                                                                           | 5           |
| Split duplicate product lines                  | [unverified]                                                                                                                           | 5           |
| Ambiguous number formats                       | [unverified]                                                                                                                           | 5           |
| Germany vs Deutschland                         | [unverified]                                                                                                                           | 5           |
| Invoice date not compared                      | [unverified]                                                                                                                           | 5           |
| Direct Supabase REST writes bypass validation  | **[checked] confirmed** for shipments (see section 5)                                                                                  | 1 design, 6 |
| In-memory job set                              | **[checked] confirmed.** `activeJobs = new Set()` in `documents/handlers.js`                                                           | 2           |
| Documents cannot be deleted or replaced        | **[checked] confirmed.** No delete route in `documents/routes.js`                                                                      | 6           |
| Stale cross-check after approval changes       | [unverified]                                                                                                                           | 5, 6        |
| No React error boundary                        | **Fixed Day 1 (PR #21).** Root and page boundaries; owner verified in browser                                                          | 1           |
| Rate limit behind Render proxy                 | **[checked] `trust proxy` not set**                                                                                                    | 2           |
| Alerts and Documents pages incomplete          | [unverified] `AlertsHub.jsx`, `DocumentsHub.jsx` exist                                                                                 | 7           |
| No CI or deploy config                         | **[checked] confirmed**                                                                                                                | 2           |

### Additional findings from the HQ review (not in the audit)

| Finding                                                                                                                                                    | Why it matters                                                                                                                                                                              | Planned day                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **No `LICENSE` file** in the repo [checked]. **Fixed in PR #19:** MIT license added (copyright holder `Zee-hub-496`)                                       | The 2025 Kiroween rules asked for a public repo with an OSI-approved license. The 2026 rules page could not be opened by the assistant, so the owner must confirm on the Devpost rules page | Done in PR #19; confirm GitHub shows "MIT License" after merge |
| `.kiro/steering/ai-integration.md` says Gemini 2.5 requests start being rerouted on 2026-12-01                                                             | Demo and judging happen Dec 1-4. Model must be verified Day 1                                                                                                                               | 1                                                              |
| Migrations 0001 and 0002 were described in the README as "not yet run". Confirm they are applied to the real Supabase project                              | Everything depends on it                                                                                                                                                                    | 1                                                              |
| README "Current status" table is stale (says tests were run on Windows with Node 24, UI "NOT run")                                                         | Judges read the README                                                                                                                                                                      | Dec 1                                                          |
| `.kiro/settings/permissions.json` and `.yaml` at the workspace level are empty files                                                                       | Harmless; leave alone                                                                                                                                                                       | none                                                           |
| Steering `product.md` still says "17-day MVP", "seven pages", and lists a crisis page as out of scope, which now conflicts with the crisis-simulation plan | Conflicting instructions confuse future sessions                                                                                                                                            | **Updated 2026-11-23** after owner approval                    |
| Steering `architecture.md` lists `controller.js` / `repo.js` which do not exist in the code                                                                | Same. **Fixed Day 1 (PR #21).**                                                                                                                                                             | Day 1 (docs only)                                              |

The test count (about 540) comes from the audit. The baseline must be re-measured on Day 1 after `npm install`; record the real number in `DAILY_PROGRESS.md`.

## 7. Prioritization

- **P0:** broken core functionality, security, data integrity, deployment.
- **P1:** major product functionality, the missing crisis workflow.
- **P2:** reliability, accuracy, UX, performance.
- **P3:** optional visual polish, extras.

Optional work never delays P0 or P1. The customs / HS-code module (`.kiro/specs/03-customs-classification`) is **out of scope** for this sprint.

If a day slips, cut in this order: Day 7 polish items (P3), then Day 6 document replace (keep delete), then Day 4 extras (keep core disruption display). Never cut: Day 1 status and error boundary, Day 2 deployment, Day 3 backend, security tests.

## 8. Eight-day engineering plan

Each day: read the three docs, make one branch per task, open PRs, update `DAILY_PROGRESS.md` before ending.

### Day 1: Nov 23, Core correctness and Gemini

Goal: the demo path works with real data and status is truthful.

Tasks:

1. `npm install`; run `npm test`; record exact baseline (pass, fail, skipped, count).
2. ~~Confirm migrations 0001 and 0002 are applied.~~ Owner confirmed on 2026-11-22: 16 public tables exist and the 0002 columns exist (owner-reported from the Supabase SQL Editor). Still run the RLS/policy check query listed in `DAILY_PROGRESS.md`.
3. Confirm GitHub shows "MIT License" on the repo page after PR #19 is merged, and re-read the 2026 Devpost rules page for license and eligibility wording.
4. Check current Gemini model availability and set `GEMINI_MODEL` to one that will work through Dec 4. Cite the source in the PR.
5. Owner reports the Gemini key works and all three PDFs extracted after the Nov 21 invoice fix (owner-reported, not yet reproduced from a clean install). Re-run once and record evidence. Run real Gemini extraction on synthetic invoice, packing list and certificate PDFs (owner provides key locally; never paste it in chat). Record outcomes honestly, including failures.
6. Verify response schema acceptance and Zod validation; improve safe diagnostics (issue paths only, never document values), cache versioning, retry on timeout/429/5xx only.
7. Shipment status derivation: pure function in `packages/core` (`documents`, `discrepancies` in, status out), called from the API after each relevant change. Remove misleading dashboard counts; counts come from derived status.
8. Design (not ship) database-level status protection. Preferred option to compare: a trigger that blocks `status` changes unless made by the server role, versus column privileges versus moving writes to a `SECURITY DEFINER` function. Ship on Day 6.
9. Root-level and route-level React error boundaries.

Acceptance criteria:

- Baseline test numbers recorded. No new failing tests.
- A shipment moves through `submitted` -> `ai_processing` -> `requires_review` / `ai_pre_cleared` based on real data, with unit tests for every transition, including "approval revoked" and "all discrepancies resolved".
- Dashboard counts equal a direct count of shipments by derived status.
- Real Gemini run documented for three document types, or the exact failure and next step.
- Throwing inside a page shows a recoverable fallback, not a white screen; the sidebar still works.
- `LICENSE` is merged and detected by GitHub.

### Day 2: Nov 24, Deployment and reliability

Tasks: Vercel (web) with `vercel.json` SPA rewrite; Render (API) with `render.yaml` or documented dashboard settings; env vars set in dashboards only; GitHub Actions CI (install, lint, format check, test, secret scan, web build); `app.set('trust proxy', 1)` with a test proving per-client rate limit keys (verify the hop count against Render's docs); `/api/health` plus a smoke-test script; recover documents stuck in `processing` after restart (use a `processing_started_at` timestamp and a startup sweep, additive migration); CORS origin set to the Vercel URL.

Acceptance criteria:

- CI is green on a PR from a clean checkout.
- A fresh user can register, sign in, and create a shipment on the deployed URLs.
- Render restart during processing does not leave documents "processing" forever.
- Rate-limit test shows two different `X-Forwarded-For` clients get separate buckets.
- No secret appears in the repo, build logs or browser bundle other than `VITE_` public values.

Note: Render free instances sleep. Plan a wake-up step before the demo and recording.

### Day 3: Nov 25, Crisis simulation backend

Tasks: scenario module (`routes`, `handlers`, `service`, `schemas`) under `apps/api/src/modules/scenarios/`; tables `disruption_scenarios`, `scenario_effects`, `route_results` already exist in 0001, so check them first and add an additive migration only if needed; validate closed port IDs and lane IDs against the real graph; run the existing A\* with the overlay; save effects and results; handle every disruption outcome (rerouted, unchanged, unreachable, origin closed, destination closed).

Acceptance criteria:

- CRUD for a user's own scenarios; another user gets 404.
- Same input as the core test cases gives the same routes via the API.
- Unknown port/lane IDs return 422.
- Shared `ports` and `shipping_edges` are never written (test).
- Every state-changing action is audit-logged.

### Day 4: Nov 26, Crisis simulation frontend

Tasks: scenario UI on the route page: close/reopen port, close/reopen lane, history list, reset; map shows original and disrupted routes; deltas for time, cost, risk; plain-English explanation generated from structured results (deterministic text, not AI); loading, error, unreachable and closed-endpoint states; mobile layout.

Acceptance criteria:

- Closing a port on the active route visibly changes the route, with before/after numbers labeled illustrative.
- Reset restores the original route.
- Playwright run at 1280px and 390px widths, with screenshots saved under `.kiro/artifacts` or `docs/screenshots`.

### Day 5: Nov 27, Document intelligence and cross-checking

Tasks (each starts with a failing regression test): evidence supports the value, not just exists; freight/insurance/tax/discount arithmetic; merge duplicate product lines; ambiguous number formats (`1.234` vs `1,234`) become "uncertain" rather than guessed; country aliases (Germany/Deutschland and similar, limited and tested); invoice date comparison where supported; uncertain evidence shown honestly in UI; cross-check marked stale or re-run when approvals change.

Acceptance criteria: a named test for every confirmed false positive; no loosening of real mismatch detection (existing weight-mismatch demo still yields its finding).

### Day 6: Nov 28, Database security and document lifecycle

Tasks: ship the status protection chosen on Day 1; tighten write policies on `shipments`, `documents`, `document_extractions`, `discrepancies`; make `audit_logs` effectively insert-only and non-forgeable; delete document (with storage object cleanup, cascade of extraction and findings, cross-check invalidation); replace document only if time allows; two-user isolation tests against a real Supabase project or the local Supabase stack.

Acceptance criteria:

- User A cannot read, update or delete any of user B's rows or storage objects by REST, Storage API or the app API.
- Direct REST `PATCH` of `status` is rejected.
- Deleting a document leaves no orphan storage object.
- API still works for the normal flow (no regression from tighter policies).

### Day 7: Nov 29, Frontend and product completeness

Tasks: finish Alerts and Documents pages with real data; empty/loading/error states; search, sorting, pagination where lists can grow; consistent typography and spacing; badge contrast (WCAG AA); button sizing; keyboard and screen-reader basics; reduce bundle (lazy-load Leaflet and the world map, which is partly done); Playwright pass on all pages at desktop and mobile.

Acceptance criteria: no page is a placeholder; Lighthouse accessibility score recorded (do not invent numbers); bundle size before/after recorded.

### Day 8: Nov 30, Integration and release readiness

Tasks: full test suite; fresh-user end-to-end on the deployed app (register, upload three documents, extract, approve, cross-check, decide, route, disrupt); two-user security test online; fix remaining P0/P1 bugs; update specs and `docs/KIRO_USAGE.md`; tag a release candidate; **feature freeze** after this day.

Acceptance criteria: a written end-to-end checklist with pass/fail per step and a link to the PR or tag.

## 9. Three-day submission plan

**Dec 1: Packaging**

- Rewrite README honestly (status table, setup, limitations, live URLs).
- Confirm `LICENSE` is visible on GitHub (open-source license detected by GitHub).
- Confirm repository is public and `.kiro/` is committed and not ignored.
- Write the Kiro usage report from `docs/KIRO_USAGE.md` (specs, steering, hooks used, concrete examples).
- Devpost description and screenshots.
- Check student prize eligibility rules on the official contest page.

**Dec 2: Video**

- Script under 3 minutes. Open with the product statement; show real upload, extraction, approval, discrepancy, route, disruption and reroute.
- Record the real deployed app (wake Render first). No fake data presented as real.
- Upload public to YouTube; check audio, captions and that it plays logged out.

**Dec 3: Final verification**

- Fresh-account run on deployed URLs. Rehearse the demo.
- Verify every URL, and demo credentials (use a dedicated demo account; never reuse a personal password).
- Complete the Devpost form, save a backup of the repo and media.
- Submit Dec 3 evening if possible.

**Dec 4: Submit** early. Do not start new work. Deadline 2:00 PM PT.

## 10. Definition of done (feature level)

A feature is done only when all are true:

1. Acceptance criteria were written before coding and each is checked off.
2. Automated tests were added and `npm test` was run, with real output reported.
3. It was run in the real app (browser automation at desktop and mobile widths where the UI changed).
4. Security impact was reviewed (auth, ownership, RLS, validation).
5. The Git diff was reviewed.
6. Docs updated: `DAILY_PROGRESS.md`, relevant spec `tasks.md`, README if user-visible.
7. PR opened with a plain-language description and honest "not verified" list.

## 11. Kiro credit use

About 4,000 credits were allocated and about 250 used (owner's figure). Track real usage from the Kiro dashboard in `DAILY_PROGRESS.md`; do not estimate. Spend on implementation, tests, independent review (`semantic_reviewer`), and codebase exploration. Do not spend on duplicate code, repeated prompts or artificial features.

## 12. Risks to watch

| Risk                                                       | Mitigation                                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| Gemini model retirement or free-tier limits during judging | Pin a supported model, cache by SHA-256, keep a recorded-fixture demo path |
| Render free tier cold starts during judging                | Health ping before demo; mention in README; consider a paid/always-on tier |
| Tighter RLS breaks the app                                 | Day 6 changes land with two-user tests and the full flow test              |
| Schedule slip                                              | Cut order in section 7; feature freeze after Day 8                         |
| Real API key leak                                          | `npm run scan:secrets`; keys only in dashboards                            |
| README claims more than exists                             | Dec 1 honest rewrite; claims only for verified items                       |
