# PortChimera 2.0 plan and progress

This file is the handoff for the 2.0 work. A new session reads this file first, then the "Current state" block in `docs/DAILY_PROGRESS.md`. Update the status column and the log at the bottom at the end of every session. Only record what was actually run.

Status values: `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED`, `DROPPED`. Test values: `PASS`, `FAIL`, `NOT TESTED`.

## Ground rules (from the master directive and `09-kiroween-execution.md`)

- All 2.0 work stays on `feat/portchimera-2.0`. `main` is not touched until the release tests pass and the owner merges.
- The original app is saved: branch `backup/portchimera-pre-v2`, tag `pre-v2-2026-11-28`, commit `b38f37c`. Details in `docs/BASELINE_BEFORE_V2.md`. Never delete or move them.
- Keep React + Vite + Express + Supabase + Gemini. No new framework, no Redis, no new database, no paid fallback.
- New application code is TypeScript. Existing JavaScript is migrated file by file, never in one sweep.
- AI discovers and explains. Deterministic code verifies and calculates. Humans approve.
- Never claim real-time monitoring. Show retrieval time and stale-data labels. Never invent market or event data.
- Treat news and document text as untrusted data. The Copilot is read-only.
- Each phase ends with: tests, typecheck, lint, build, diff review, secret scan, one commit (see section 18 of the directive).

## Constraints found on 2026-11-28

1. **The agent sandbox has no npm access** (network mode `INTEGRATIONS_ONLY`; every registry request returns 403). It cannot run `npm ci`, install TypeScript or Playwright, run ESLint with the project config, build the web app, or reach GDELT, EIA, UKMTO, MARAD, Vercel, Render or Supabase. Code that cannot be run cannot be marked PASS. Phases 1 to 7 therefore need one of: (a) the owner's machine with Kiro IDE (`D:\KIRO\PortChimera`), or (b) a session with `OPEN_INTERNET` network mode. The agent can still write code and docs here, and the owner runs `npm ci && npm test && npm run typecheck && npm run lint && npm run build -w @portchimera/web` and reports the output.
2. **Time.** The deadline is Dec 4, 2026, 2:00 PM PT. That is 6 days from the start of this work. The master directive is several weeks of work. The existing rule says aim to submit on Dec 3 evening. The plan below is cut into tiers so the project can ship at any point.
3. **Scope rule conflict.** `09-kiroween-execution.md` and `DAILY_PROGRESS.md` declare a feature freeze since 2026-11-25. The owner's 2.0 directive of 2026-11-28 supersedes it for the work listed here only. The steering files must be updated to say so (done in this commit).
4. **Fallback.** If 2.0 is not reliable at the 2.0 feature freeze (proposed: Dec 2, 18:00 local), the submission uses the original app: deploy from tag `pre-v2-2026-11-28` (or leave `main` as is) and do not merge 2.0.

## Tiers (what to build first)

- **Tier A, must have for a convincing demo:** Phase 1 (minimal TypeScript), Phase 3 (World Monitor), Phase 4 (Shipment Exposure), Phase 5 (Energy Watch).
- **Tier B, valuable:** Phase 6 (Copilot, Gemini only, read-only), Phase 2 (only the parts the new pages need: responsive sidebar, drawer, skeletons, empty states).
- **Tier C, only if time remains:** open-weight provider evaluation, full shadcn/Radix adoption, TanStack Table, React Hook Form, full Playwright suite, bundle analysis.
- **Always:** Phase 8 documentation, and Phase 7 tests for whatever shipped.

## Decisions needed from the owner (each blocks something)

| #   | Decision                                                                                                                                                                                                                               | Blocks   | Agent recommendation                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Where does code get run: owner's machine, or an open-internet session?                                                                                                                                                                 | Phase 1+ | Owner's machine for install/run; the agent writes code and the owner pastes outputs.                                                                                                                                   |
| D2  | Approve dev dependencies `typescript`, `@types/node`, `@types/express`, `@types/react`, `@types/react-dom`, `@types/leaflet`, `@types/cors`.                                                                                           | Phase 1  | Approve. `zod` is already installed and gives runtime schemas and `z.infer` types.                                                                                                                                     |
| D3  | How the API runs `.ts`. Option 1: Node 22.18+ native type stripping, no build step (works on Node 22.23.4 here; needs `NODE_VERSION` pinned to 22.18 or later on Render). Option 2: compile with `tsc` to `dist` and start from there. | Phase 1  | Option 1 for simplicity: `.ts` files use only erasable syntax (no `enum`, no parameter properties) and import with the `.ts` extension. Verify the Render Node version before relying on it. Option 2 is the fallback. |
| D4  | Get a free EIA API key at https://www.eia.gov/opendata/ and set `EIA_API_KEY` in Render only.                                                                                                                                          | Phase 5  | Required for real Brent data. Without it Energy Watch shows "not configured", never invented numbers.                                                                                                                  |
| D5  | Approve Playwright as a dev dependency (browsers are a large download) and a CI job for it.                                                                                                                                            | Phase 7  | Approve for a small smoke suite (login, World Monitor, mobile nav, two-user isolation). Needs test accounts on a local Supabase or a dedicated test project, never production.                                         |
| D6  | Chart library for Energy Watch. There is none in the project today.                                                                                                                                                                    | Phase 5  | No new dependency: draw the price line as a small inline SVG component (one series, about 80 lines). Revisit only if a second chart type is needed.                                                                    |
| D7  | Gemini free-tier privacy: prompts sent to the free tier can be used by Google to improve products. Copilot context must contain no real documents.                                                                                     | Phase 6  | Use synthetic data in public demos; document it in `docs/AI_NOTES.md`; send only structured shipment fields, never document files.                                                                                     |
| D8  | Confirm the 2.0 feature-freeze date and fallback rule above.                                                                                                                                                                           | all      | Dec 2 evening freeze; Dec 3 release checks and video; Dec 4 morning submit.                                                                                                                                            |

## Dependency choices (evaluated against what exists)

| Proposed             | Decision                                                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TypeScript           | Adopt (D2).                                                                                                                                                                                                                    |
| Motion for React     | Do not install. The project uses `framer-motion` 12, the same library renamed. Keep it. Respect `prefers-reduced-motion` with its `useReducedMotion`.                                                                          |
| Sonner, Lucide, cmdk | Already installed. Keep.                                                                                                                                                                                                       |
| shadcn/ui and Radix  | Adopt per component only when one is needed (Dialog, Sheet for the mobile drawer, Tooltip, Tabs). Each is a copied file plus a `@radix-ui/*` package, so approval per package. Do not restyle existing pages for its own sake. |
| TanStack Query       | Adopt only if the new pages need caching and refetch that the current `apiCore.js` does not give. Decide in Phase 3; the server cache already covers most of it.                                                               |
| React Hook Form      | Skip. Existing forms work (`shipmentForm.js`, `signupForm.js`). The Copilot has one text input.                                                                                                                                |
| TanStack Table       | Skip. Alerts and Documents lists already paginate. Use a card layout on mobile.                                                                                                                                                |
| Playwright           | Adopt (D5).                                                                                                                                                                                                                    |
| Shared contracts     | Put them in `packages/core/src/contracts/*.ts` as Zod schemas plus `z.infer` types. `packages/core` has no dependencies today, so adding `zod` there is the only change. No new workspace.                                     |

## Phases

### Phase 0: safety checkpoint

| Task                                                                | Status  | Evidence                                                                                                                                                                   |
| ------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inspect Git state, record original SHA                              | DONE    | `b38f37c`, tree clean, `docs/BASELINE_BEFORE_V2.md`                                                                                                                        |
| Create and push backup branch and tag, verify on remote             | DONE    | `git ls-remote` shows both at `b38f37c`                                                                                                                                    |
| Create `feat/portchimera-2.0` from the backup commit                | DONE    | Local branch created; pushed with the first commit                                                                                                                         |
| Baseline tests                                                      | PARTIAL | Core 221, scripts 23, web 230 pass. API 162 of 175; the other 13 need `node_modules`. Lint, build, browser NOT TESTED in the sandbox. Owner to run the full baseline (D1). |
| Write `docs/BASELINE_BEFORE_V2.md`, this plan, update handoff files | DONE    | This commit                                                                                                                                                                |

### Phase 1: engineering foundation (Tier A, smallest version)

Goal: `npm run typecheck` runs real TypeScript checks, new code is `.ts`, legacy `.js` is untouched.

1. `TODO` Add `typescript` and the `@types/*` packages (D2). Owner runs the install and commits the lockfile.
2. `TODO` Root `tsconfig.base.json` with `strict: true`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `allowJs: true`, `checkJs: false`, `noEmit: true`, `module: nodenext` for Node code and `moduleResolution: bundler` for the web app.
3. `TODO` Per-workspace `tsconfig.json` in `apps/api`, `apps/web`, `packages/core` that extend the base. Web uses `jsx: react-jsx`.
4. `TODO` Scripts: `typecheck` in each workspace and a root `npm run typecheck` that runs all three. Add the step to `.github/workflows/ci.yml`.
5. `TODO` Update `npm test` globs to also pick up `*.test.ts` (D3). Update ESLint config for `.ts`/`.tsx` (`typescript-eslint`, needs approval) or scope ESLint to `.js` and `.jsx` and let `tsc` cover TypeScript. Prefer the second for now to avoid a new dependency.
6. `TODO` Contracts in `packages/core/src/contracts/`: `apiResponse.ts` (`{ data }` / `{ error: { code, message } }` as already used), `apiError.ts`, `shipment.ts`, `document.ts`, `crosscheckFinding.ts`, `route.ts`, `port.ts`, `lane.ts`, `disruptionEvent.ts`, `newsArticle.ts`, `oilMarketRecord.ts`, `shipmentExposure.ts`, `assistantMessage.ts`. Start with the ones Phase 3 to 5 need: `apiResponse`, `apiError`, `newsArticle`, `disruptionEvent`, `oilMarketRecord`, `shipmentExposure`, `assistantMessage`. Add the rest when the code that uses them is touched.
7. `TODO` Acceptance: typecheck passes on a clean checkout; one deliberate type error makes it fail (prove the check works); all existing tests still pass with unchanged counts (221 core, 23 scripts, 230 web, 175 api).

### Phase 2: design system (Tier B, only what new pages need)

1. `TODO` Collapsible desktop sidebar and mobile navigation drawer in `AppLayout.jsx`. New navigation group "Maritime Intelligence" with World Monitor, Energy Watch, Shipment Exposure.
2. `TODO` Shared pieces used by the new pages, written as `.tsx` in `apps/web/src/components/`: Skeleton, EmptyState, ErrorState, StatusBadge, StaleBadge, Sheet. Reuse the tokens already in `index.css` and `ui.jsx`; do not restyle old pages.
3. `TODO` Lazy-load the new route pages with `React.lazy` (the map is already lazy: `MaritimeMapLazy.jsx`).
4. `TODO` Motion: page fade, card entry, drawer; all gated by `useReducedMotion`.
5. `TODO` Check at 360, 390, 768, 1366, 1920 px with screenshots saved to `docs/screenshots/` (owner or Playwright).
6. `TODO` Optional (Tier C): shadcn/Radix pieces, bundle analysis, font and image review.

### Phase 3: World Monitor (Tier A)

API endpoint `GET /api/intelligence/news` (protected, Zod query: `q`, `region`, `category`, `page`, `pageSize`, `refresh`).

1. `TODO` **Verify sources before coding** (the sandbox cannot reach them; check from Render or the owner's machine): GDELT DOC 2.0 API (`api.gdeltproject.org/api/v2/doc/doc`, no key, JSON, ArtList mode, query by theme and keyword, `maxrecords` capped); whether UKMTO and MARAD publish an RSS, JSON or documented feed. If a source has no stable feed, link to it as "official source" but do not scrape. Record what was found, with the date, in `docs/INTELLIGENCE_SOURCES.md`.
2. `TODO` Module `apps/api/src/modules/intelligence/` as `.ts`: `routes.ts`, `handlers.ts`, `service.ts`, `schemas.ts`, `gdeltClient.ts`, `classify.ts`, `dedupe.ts`, `cache.ts`.
3. `TODO` Client: `AbortController` timeout (8 s), one retry with backoff on 429 and 5xx, response validated with Zod, malformed items dropped and counted.
4. `TODO` Classification is deterministic keyword and theme rules in `classify.ts` (no AI) into the eight categories. Source class is `OFFICIAL_SOURCE` only for domains on an allowlist (official sources); GDELT items are `MEDIA_REPORT`; anything else `UNVERIFIED_REPORT`.
5. `TODO` Geography: match region and place names against a small gazetteer (Gulf, Hormuz, Red Sea, Bab el-Mandeb, Suez, Gulf of Aden, Malacca, Black Sea, and so on) keyed to the existing seed ports and chokepoints (`apps/web/src/lib/chokepoints.js`, `supabase/seed/ports.json`). An event with no confident match has no coordinates.
6. `TODO` In-memory TTL cache (about 15 min) keyed by query, with `fetchedAt`. On upstream failure return the last cached value flagged `stale: true`. The cache is lost when Render sleeps; that is acceptable and documented.
7. `TODO` Dedupe by normalized URL (lowercase host, strip tracking params and fragment) and normalized title.
8. `TODO` Rate limit for this route group, stricter than the global one.
9. `TODO` Web page `/intelligence/world-monitor`: list, search, region and category filters, pagination, refresh, "Last updated" and stale badge, source link on every event, error state. No "LIVE" label.
10. `TODO` Tests: classification table, dedupe, URL normalization, malformed GDELT payload, upstream timeout, stale fallback, 401 without a token, route registered in `PROTECTED_PREFIXES` (the existing test enforces this), prompt-injection text in a headline stays inert.

### Phase 4: Shipment Exposure (Tier A, main differentiator)

`GET /api/intelligence/exposure/:shipmentId` (protected, ownership check through the user-scoped database client, same 404 pattern as other shipment routes).

1. `TODO` Pure function in `packages/core/src/exposure/` (`.ts`): inputs are the shipment's computed route (ports and edges from the existing A* result) and a list of events with optional coordinates and chokepoint ids; output is one of `NO_KNOWN_EXPOSURE`, `REGIONAL_MATCH`, `ROUTE_EXPOSURE`, `CONFIRMED_ROUTE_CLOSURE`, plus the reasons.
2. `TODO` Rules: `CONFIRMED_ROUTE_CLOSURE` only when the event is `OFFICIAL_SOURCE`, is a closure, and maps to a specific edge or chokepoint on the route. A security incident is at most `ROUTE_EXPOSURE` and never removes an edge. A port strike adds modeled delay only when that port is on the route. Weather is ignored unless data and geography both support it. Oil price never changes route risk. Country-level news gives at most `REGIONAL_MATCH`.
3. `TODO` Each assessment returns: headline, source link, event time, geographic connection, why it may matter, what is verified, what is uncertain.
4. `TODO` Integrate with the existing simulator: "Open crisis simulator" pre-fills a disruption from the event but the user must press the simulate button. "Compare alternatives" calls the existing A* with the disruption applied. Nothing reroutes a shipment or changes its status.
5. `TODO` Web page `/intelligence/exposure` plus an exposure card on the shipment overview.
6. `TODO` Tests: no match, regional-only match, route intersection, confirmed closure, security incident without closure, port strike on and off the route, another user's shipment (404), malformed event.

### Phase 5: Energy Watch (Tier A)

`GET /api/intelligence/energy` (protected).

1. `TODO` Verify the EIA v2 series for Brent daily spot (`PET.RBRTE.D` is the v1 id; the v2 route is `petroleum/pri/spt` with `facets[series][]=RBRTE`). Check from a machine with network access; record in `docs/INTELLIGENCE_SOURCES.md`. Needs D4.
2. `TODO` `eiaClient.ts` (key from `process.env.EIA_API_KEY`, never sent to the browser or logged), Zod-validated response, timeout and one retry.
3. `TODO` Server cache (6 to 12 h; EIA daily data updates once per business day) with last-good fallback and timestamps.
4. `TODO` Derived fields computed deterministically: latest value, latest date, daily percent change, 7-day trend, history for the chart (about 90 points). WTI optional.
5. `TODO` Web page `/intelligence/energy`: price card with "USD per barrel", date of data, change, trend, SVG chart (D6), stale badge. Visible note: Brent is a crude benchmark, not a freight rate, insurance premium or bunker price.
6. `TODO` Tests: parse a recorded sample payload, percent change math, stale fallback, missing key gives "not configured", malformed payload.

### Phase 6: Chimera Copilot (Tier B)

`POST /api/assistant/chat` (protected, Zod body: `message`, optional `shipmentId`, bounded `history`).

1. `TODO` AI provider interface in `apps/api/src/ai/provider.ts` (`generateText`, `generateJson`, `isAvailable`) with the existing Gemini code wrapped behind it. Extraction keeps using the current Gemini path unchanged; its fixtures and tests must still pass.
2. `TODO` Context builder (deterministic, size-capped): shipment fields, origin and destination, approved document values, unresolved findings, current route summary, top relevant cached events, latest Brent record. No files, no raw document text.
3. `TODO` Prompt: system rules, then context as delimited data, then the user message. Article text is labelled untrusted. Output is a plain answer with source links taken from the context, not from the model.
4. `TODO` Read-only by construction: the assistant module imports no write function (no approve, resolve, status or audit write). A test asserts this.
5. `TODO` Rate limit (strict), 20 s timeout, error mapping, no prompt or answer in logs.
6. `TODO` Web: floating launcher bottom right on authenticated pages, panel on desktop, full-screen sheet on mobile, suggested questions, loading and error states, clear conversation, focus trap and Escape to close. Streaming only if Gemini streaming proves reliable; otherwise a single response.
7. `TODO` Tests: 401 without token, other user's `shipmentId` gives 404 and no context leak, injected instruction in a headline does not change behavior (provider is faked), Gemini unavailable gives a clean error.
8. `TODO` (Tier C) Evaluate Cloudflare Workers AI on a small labeled set; only add a second provider if the numbers justify it. Record results in `docs/AI_NOTES.md`.

### Phase 7: testing and security regression

1. `TODO` Run the whole suite plus `typecheck`, `lint`, build, on the owner's machine; record counts.
2. `TODO` Playwright smoke suite (D5): sign-in, World Monitor loads and shows an error state when the API is down, exposure page, Copilot opens and closes, mobile navigation at 390 px, two-user isolation.
3. `TODO` Manual check of the deployed app with `docs/E2E_CHECKLIST.md` (owner). Every line PASS, FAIL or NOT TESTED.

### Phase 8: release

1. `TODO` Update `README.md`, `docs/KIRO_USAGE.md` (only features actually used), `docs/E2E_CHECKLIST.md`, `docs/DAILY_PROGRESS.md`, `docs/DEMO.md`, `docs/DEVPOST_DRAFT.md`, `docs/AI_NOTES.md`, `docs/DEPLOYMENT.md` (new `EIA_API_KEY`).
2. `TODO` Set `EIA_API_KEY` on Render. Check that CORS and the rate limits still work.
3. `TODO` Merge via PR only after the owner approves. Tag `v1.0.0` on Dec 3.
4. `TODO` Record the video from the real app, under 3 minutes, public on YouTube. If the 2.0 features are unreliable, record from the baseline.

## New environment variables (names only)

| Name          | Where  | Purpose                                                |
| ------------- | ------ | ------------------------------------------------------ |
| `EIA_API_KEY` | Render | EIA Open Data key for Energy Watch. Never in `VITE_*`. |

No database migration is planned for 2.0. News and market data are cached in API memory. If a table is later required, it needs an additive migration with RLS, a rollback note and a two-user isolation check.

## What the next session does first

1. Read this file, then `docs/BASELINE_BEFORE_V2.md` and the "Current state" block in `docs/DAILY_PROGRESS.md`.
2. Run `git branch --show-current`; it must print `feat/portchimera-2.0`. Run `git ls-remote origin refs/heads/backup/portchimera-pre-v2 'refs/tags/pre-v2-2026-11-28^{}'`; both must show `b38f37c`.
3. Run `get_sandbox_info`. If the network mode is not `OPEN_INTERNET`, plan for the owner to run installs and checks (D1).
4. Ask the owner for D1 to D8. Do not install anything or start Phase 1 until D1 to D3 are answered.
5. Work the lowest-numbered `TODO` in the highest tier. One phase per branch commit series; update the status cells here before ending the session.

## Session log

| Date       | Who   | What happened                                                                                                                                                                                                       | Commit      |
| ---------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 2026-11-28 | agent | Phase 0 done. Backup branch and tag created and verified on the remote. Dev branch created. Partial baseline run (sandbox has no npm access). Plan, tiers and owner decisions written. No application code changed. | see Git log |
