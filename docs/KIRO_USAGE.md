# How Kiro was used to build PortChimera

A running log for the hackathon write-up. Add an entry whenever Kiro changes how something is built.
Keep entries concrete: what was asked, what Kiro produced, what was verified, what was fixed.

## 2026-11-17: Foundation session

**Planning before code.** Kiro reviewed the original specification before writing anything, and found problems that changed the design:
auth defined twice (Supabase and custom endpoints), RLS that the backend would have bypassed with a service-role key,
disruptions that would have changed a shared graph, and a scope too large for 17 days. Each became a recorded decision in
`.kiro/steering/architecture.md`.

**Steering files** (`.kiro/steering/`): product rules, architecture and the dependency rule for `packages/core`, conventions, API,
database, security, AI integration, testing. Some load always; others only when matching files are open (`fileMatch`).

**Specs** (`.kiro/specs/01..08`): each with requirements (testable statements), design, and tasks. Task status uses
`[x]` verified, `[-]` written but unverified, `[ ]` not started, so the list never overstates progress.

**What Kiro could not do, and how it was handled.**

- The authoring sandbox had no npm registry access, so dependency-based tests could not run there.
  Kiro switched the test runner to Node's built-in `node:test`, ran what could run (core and error-handler tests, 9 passing),
  and marked the rest unverified instead of claiming success.
- Official Google and Devpost pages returned 403 to the sandbox, so Gemini model names and limits and the hackathon's
  repository rules were **not** confirmed there. They are listed as manual checks in specs 02 and 08.
- No Postgres was available, so the migration is marked "not yet run".

**Verification examples.** The secret scanner was proven by planting a fake key and confirming it failed the scan.

## Hooks, agents, MCP

To be recorded here when added.

## 2026-11-17: Routing engine and disruption overlay

**Spec-driven build.** The A\* and crisis specs (`.kiro/specs/05`, `06`) were written first. The code follows their design
documents, and the task lists record what was verified.

**Tests that can fail.** Passing tests are not evidence unless they can fail. Each engine was broken on purpose to confirm tests notice:
a heuristic that overestimates (5 tests failed), a seed edit without regenerating files (sync test failed), an overlay that leaves a closed
port's lanes in the graph (tests failed), and a simulation that costs routes with the wrong scale (the scale test failed).

**Bugs found by running things, not by reading.** Two test setups were wrong the first time (a tie-break test whose costs were not
actually tied, and an "opposite direction" test that silently emptied its input). One explanation sentence began in lowercase.
Each was fixed after a run exposed it.

**A process mistake, recorded honestly.** A stacked pull request was merged into its parent branch after the parent had already merged into
`main`, so the seed data missed `main` and needed a second pull request. Later PRs target `main` directly.

**A bug only the author's machine could find.** After the overlay merged, the author ran `npm test` on Windows and one test failed:
Git had converted the generated seed SQL to CRLF line endings, which a byte-for-byte comparison treated as a content change. The authoring
sandbox runs Linux, so it could not see this. Fix: the test now ignores line-ending style, and `.gitattributes` forces LF everywhere.
The fix was verified by converting the file to CRLF on purpose, and by checking that a real content change still fails the test.

## 2026-11-17: Cross-document checker

**Spec corrected before building.** Writing the percent formula exposed a contradiction in the spec Kiro had written earlier: the requirement said
500 kg vs 650 kg is "30%", the design's formula gives 23.1%. The requirement was fixed and the definition (difference divided by the larger value)
was made order-independent, with a test that swapping the documents gives the same number.

**A domain problem found by running the fixtures.** The first version paired a certificate of origin's single summary line ("Cotton t-shirts and
denim jeans") with the first invoice line and reported a false "wording differs" finding. Certificates summarize goods, so they are now checked by
word coverage against all invoice lines. The fix was driven by a fixture whose correct answer is "no findings".

**Honest edge cases chosen on purpose:** the unit "tons" is refused (metric, short and long tons differ by up to 10%); unrecognized countries give
a medium finding instead of high; and "nothing compared" reports `not_enough_data`, never `consistent`.

**Mutation checks:** removing the tolerance, the company-suffix rules, the larger-value percent, the critical rule, or the tonne conversion each
made between 1 and 12 tests fail.

## 2026-11-18: API login protection (spec 01)

**What Kiro produced:** a `requireAuth` middleware, a Supabase token verifier, `GET /api/auth/me`, an audit helper and `docs/SETUP_SUPABASE.md`, with tests that use fake Supabase clients.

**Verified:** 26 new tests pass in the authoring sandbox. Five deliberate breakages of the code were each caught by a failing test, then restored.

**Not verified:** the Express route tests and the production environment test have not been run (dependencies cannot be installed in the sandbox). Nothing has been tried against a real Supabase project, and the migration has not been run. The setup guide lists the manual checks.

## 2026-11-19: Web login, shipments and route page

**What Kiro produced:** API modules for shipments, ports and route calculation, then a React login page, a protected shipments page (create and list) and a route page with an SVG sketch of the path. All decisions (validation, formatting, projecting coordinates) sit in plain JavaScript files under `apps/web/src/lib`, so components only display them.

**Verified:** the plain-JavaScript logic and the API service and handler tests pass with `node --test` in the authoring sandbox, including a two-user check (Bob cannot see or open Alice's shipment).

**Not verified:** the web build (`vite build`), the React pages in a browser, the Express routes, the zod schema tests, and sign in against a real Supabase project. Dependencies could not be installed in the sandbox. Follow `docs/MILESTONE_LOGIN_SHIPMENTS.md` to check these yourself. Route results are not saved to `route_results` yet.

## 2026-11-20: Document upload and AI extraction (spec 02)

**What drove it:** the spec in `.kiro/specs/02-document-intelligence/` (requirements, design, tasks) and the steering files in `.kiro/steering/` (ai-integration, security, api, database, testing, conventions). The task was split into four features: AI and file logic, API endpoints, web UI, then docs. No hooks or MCP servers were used for this milestone. The design was changed from the spec on purpose: no `multer`, no `pdf-parse`, no Google SDK (see `design.md`).

**What Kiro produced:** file validation by magic bytes, a small PDF text reader, zod schemas, an evidence verifier, a fake and a Gemini REST provider, document endpoints with a background job and hash cache, a review screen, synthetic fixtures in `fixtures/documents/`, `docs/AI_NOTES.md` and `docs/MILESTONE_DOCUMENTS.md`.

**Verified:** the plain-JavaScript logic, services, handlers and web helpers pass with `node --test` in the authoring sandbox. No test calls the network.

**Not verified:** the real Gemini API (no key was available), real Supabase Storage and database, Express routes, zod schemas, the React page, the Vite build and a browser. Follow `docs/MILESTONE_DOCUMENTS.md`.

## 2026-11-21: Cross-check inside the app (spec 04, tasks 6, 7, 9)

**What drove it:** `.kiro/specs/04-cross-checking/` and the steering files in `.kiro/steering/`. The work was split into a core fix and an in-app feature. No hooks or MCP servers were used.

**What Kiro produced:** a pure mapper from reviewed extraction payloads to the checker's input, migration `0002_discrepancy_finding_key.sql`, the endpoints `POST /api/shipments/:id/cross-check`, `GET /api/shipments/:id/discrepancies` and `PATCH /api/discrepancies/:id` with audit entries, a cross-check page with accept, resolve and dismiss, a synthetic demo set of three PDFs (one planted 500 kg vs 650 kg gross weight difference), and `docs/MILESTONE_CROSSCHECK.md`.

**Verified:** the mapper, re-run rules, handlers (owner-only, fewer than two reviewed documents, persistence, decisions kept on re-run, audit) and web helpers pass with `node --test` in the authoring sandbox.

**Not verified:** migration 0002 on Supabase, Express routes, zod schemas, the React page, the Vite build, and whether Gemini reads the demo PDFs as the tests assume. Follow `docs/MILESTONE_CROSSCHECK.md`.

## 2026-11-21: UI redesign (frontend only)

**What drove it:** a request for an enterprise logistics look, split into four features on branch `feat/ui-redesign`: design system and theme, public landing and auth pages, app shell and shipment pages, then the reusable map. Steering files in `.kiro/steering/` applied (business logic in `src/lib` with tests, honest labels, no new unexplained dependencies). No hooks or MCP servers were used. API, Supabase, auth flow, upload and cross-check code were not changed.

**What Kiro produced:** theme tokens and a Light, Dark and System switch, a compass logo and favicon, landing page, split-screen login and register, an app shell with sidebar, breadcrumbs and a Ctrl+K palette, shipment tabs, hub pages, and a `MaritimeMap` component (MapLibre with CARTO tiles, port pins, curved route arcs, disrupted-port markers, progressive route drawing). Five dependencies were added: `lucide-react`, `framer-motion`, `maplibre-gl`, `cmdk`, `sonner`. The old SVG route sketch (`mapProjection.js`) was removed. `docs/MILESTONE_UI.md` has the steps.

**Verified:** the pure helpers (map arcs, route and marker GeoJSON, progressive line, search, breadcrumbs, site content, status tones) pass with `node --test`. Prettier and the secret scan pass. A script checked that every relative import in `apps/web/src` resolves and that named imports are exported.

**Not verified:** `npm install`, `npm run dev:web`, the Vite build, any page or the map in a browser, CARTO tiles, WebGL, the Ctrl+K palette, animations, `lucide-react` icon names, and the hand-written package versions. Migration 0002 is still not run, so the cross-check page may error. Follow `docs/MILESTONE_UI.md` and send back any error text.

## 2026-11-22: maplibre-gl security upgrade

**What drove it:** `npm audit` reported a critical advisory for `maplibre-gl` 6.4.0 and older ([GHSA-jrc7-96c5-q579](https://github.com/advisories/GHSA-jrc7-96c5-q579), an XSS sanitizer bypass in `DOM.sanitize`). Our `^4.7.1` range was affected.

**What Kiro did:** checked the advisory against MapLibre's changelog (fixed in 6.4.1) and upgraded `apps/web` to `^6.19.0`. Version 6 is ESM-only with no default export, so `MaritimeMap.jsx` now uses `import * as maplibregl from 'maplibre-gl'`. The other v5 and v6 breaking changes were checked against our usage and none apply. Our popups use `setText` and `setDOMContent`, never `setHTML`.

**Not verified:** `npm install`, the Vite build and the map in a browser. `package-lock.json` is not committed yet. Run `npm install`, build, open a map page, then commit the lockfile. Version 6 needs WebGL2, and the text fallback should show without it.

## 2026-11-21: map stayed an empty grey box after the maplibre-gl 6 upgrade

**What happened:** after the upgrade the build and tests passed, but the map on `/map` was blank with no tiles, controls or fallback message.

**Cause:** maplibre-gl 6 starts its worker from `new URL('./maplibre-gl-worker.mjs', import.meta.url)`. MapLibre's [v5 to v6 migration guide](https://github.com/maplibre/maplibre-gl-js/blob/v6.19.0/docs/guides/v5-to-v6-migration-guide.md) says this does not resolve inside a bundler such as Vite, so each app must call `setWorkerUrl()` once. Without the worker the style never loads, and no error event fires, so the fallback never showed.

**Fix:** `MaritimeMap.jsx` now imports `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url` and calls `setWorkerUrl()`. The `?worker&url` query is documented for Vite 6 ([Vite features guide](https://github.com/vitejs/vite/blob/v6.0.0/docs/guide/features.md)). The text fallback now also appears if the style has not loaded after 15 seconds.

**Not verified:** this sandbox has no `node_modules`, so the fix was not built or run in a browser. Confirm the map renders on `/map` after pulling.

## 2026-11-21: replaced maplibre-gl with Leaflet

**What happened:** the map was still a blank grey box on the landing page, `/map` and the shipment Route tab. Chrome logged `Error: Worker failed to load. Check that the worker URL is correct.` from the pre-bundled `maplibre-gl.js`, even after the `setWorkerUrl()` fix above.

**Why Leaflet:** MapLibre 6 needs a separate worker file and WebGL, and its worker failed to load under the Vite dev server. Leaflet 1.9.4 (latest stable, no advisories in the GitHub advisory database) uses neither a worker nor WebGL, so this whole failure class is gone. Brief allowed "maplibre-gl (or leaflet + react-leaflet)". Plain `leaflet` is used imperatively, so `react-leaflet` is not needed.

**What Kiro did:** rewrote `MaritimeMap.jsx` with the same props. The basemap is CARTO raster tiles (light and dark) that swap with the theme. Ports are `circleMarker` pins with name labels and DOM-built popups. Routes are great-circle polylines (solid, solid in a second colour, red dashed). Disrupted ports get a ring and a CSS pulse. The text fallback shows when no tile loads or nothing arrives within 15 seconds. `styleFor` in `mapData.js` now returns tile URL templates, with a new `toLatLngs` helper and tests. `maplibre-gl` was removed from `apps/web/package.json` and `leaflet` added. `package-lock.json` was not edited.

**Not verified:** this sandbox has no `node_modules` or network, so `npm install`, the Vite build and the map in a browser were not run. Run `npm install` in the repo root (this removes `maplibre-gl` and adds `leaflet`), then open `/`, `/map` and a shipment Route tab.

## 2026-11-21: replaced the CARTO tiles with a self-hosted vector map

**What happened:** Leaflet rendered, but every CARTO tile showed the watermark "API KEY REQUIRED carto.com/basemaps/apikey". CARTO basemaps now need a key, so the background was unusable. The landing page "port network" map also showed five tiny pins in a wrapped world, and routes were straight great-circle arcs that crossed land (Singapore to Karachi cut through India).

**Fix:** no external tile service any more.

- **Basemap:** `scripts/build-world-geojson.mjs` turns Natural Earth 1:110m countries (public domain, per its LICENSE.md) into `apps/web/src/assets/world-110m.json` (names and geometry only, 2 decimals, no Antarctica, about 160 KB). Leaflet draws it with `L.geoJSON` on a canvas renderer. The sea is the container background, and land, borders and a faint graticule take their colours from the light or dark theme. `worldCopyJump` is off and `maxBounds` plus a computed minimum zoom keep the world from repeating.
- **Sea lanes:** `apps/web/src/lib/seaLanes.js` has hand-picked waypoints for all 30 seeded lanes, reversed for the opposite direction, with great-circle pieces between them. Legs without a lane fall back to the old arc. Lines that cross the date line are cut into two pieces. Routing and the API are unchanged.
- **Chokepoints:** `apps/web/src/lib/chokepoints.js` plus `chokepointsOnPath`. The map draws diamonds, highlights those on the route and names them under the map.
- **Look:** DOM pins with a white ring and soft shadow, halo labels (hidden at world zoom when there are many ports, always shown for highlighted ports), themed zoom controls, rounded bordered container.

**Tests:** node:test only. The main one samples every lane every 25 km against the bundled polygons and fails on any sample on land, except within 60 km of a port or a narrow passage (Suez, Bab-el-Mandeb, Hormuz, Gibraltar, Dover). The first run found three lanes on land (Gulf of Suez, the Salalah coast and the Namibian coast), which were fixed by moving waypoints. Other tests cover chokepoints on the Shanghai to Karachi and Rotterdam to Karachi routes, the date-line split, and that the asset has no URL and stays under 300 KB.

**Honesty:** sea lanes are illustrative, not vessel tracks and not for navigation. The land test uses coarse 110m polygons, so it proves lanes do not cross the bundled land, not that they are safe.

**Not verified:** no `node_modules` or network here, so the Vite build and the rendering in a browser were not run. Pull, run `npm install`, and check `/`, `/map` and a shipment Route tab.

## 2026-11-21: invoice extraction failed on the real demo invoice

**What happened:** with a real Gemini run, `fixtures/documents/demo-invoice.pdf` ended in "The AI answer could not be validated, so it was discarded". The packing list and certificate of origin extracted fine.

**Likely cause (not confirmed from a log):** the invoice PDF states "Total Gross Weight: 500 kg", but the invoice field list had no total weight fields. The prompt only described the shape in text, and the zod schema is strict at every level, so an extra key such as `total_gross_weight` is rejected as `unrecognized_keys`.

**Fix:**

- `total_net_weight` and `total_gross_weight` are now optional invoice fields. The cross-check maps them to the invoice's document-level `netWeight` and `grossWeight`. The demo still gives exactly one high finding (500 kg vs 650 kg). `SCHEMA_VERSION` is now 2 so cached version 1 results are not reused. Version 1 payloads still validate and map, since the new fields are optional.
- The request now sends `generationConfig.responseSchema`, generated from `DOCUMENT_FIELDS` in `responseSchema.js` (see `docs/AI_NOTES.md`, "Structured output").
- A failed validation now logs the path and issue code (for example `fields: unrecognized_keys (total_gross_weight)`), never document values.

**Not verified:** no real Gemini call was made. The zod tests need `node_modules`, so they were written but not run in the sandbox. Run `npm test` after pulling, then press "Read again with AI" on the demo invoice.

## 2026-11-22 to 2026-11-25: the Day 1 to Day 7 sprint (Kiro Web)

**How the work was run.** One written plan (`docs/PORTCHIMERA_EXECUTION_PLAYBOOK.md`) and one log (`docs/DAILY_PROGRESS.md`) carried the context between sessions. Each session started by reading the log, worked one day of the plan, and ended by updating it. Steering file `.kiro/steering/09-kiroween-execution.md` holds the sprint rules (honest status, no claims without a run, secrets only in dashboards). The log records what was not run, so the next session did not assume it.

**Where Kiro could not run things, and what was done about it.** The Kiro Web sandbox cannot install npm packages or reach Gemini or Supabase. Kiro wrote code and tests that run with fakes (`node --test`, a fake database that emulates Row Level Security), and the owner ran everything real on Windows: `npm test`, lint, the build, real Gemini extraction, the browser. GitHub Actions (Day 2) now runs install, lint, format check, tests and the web build on every PR.

**Concrete examples**

- **Day 1, shipment status.** The pure function `deriveShipmentStatus` (core) has a table-driven test for every rule. The owner then ran the real flow with three demo PDFs and the status moved through each state. The same session found that the dashboard's "Cleared" tile could never be non-zero and replaced it with "AI pre-cleared".
- **Day 1, a design that needed a human decision.** `docs/DESIGN_STATUS_PROTECTION.md` compared four ways to stop users from editing their own status through the Supabase REST API. The owner picked Option A, which needs the service-role key for one write. It was built on Day 6.
- **Day 2, CI false positives.** The first CI run failed with 205 "unused variable" errors because ESLint had no React rules. Adding the React plugins fixed it. This was a tooling gap, not 205 real bugs.
- **Day 3 and 4, crisis simulation.** Backend first (scenario CRUD, simulate endpoint, 27 tests with Alice and Bob), then the route-page UI. The core simulator from Nov 17 was reused unchanged.
- **Day 5, cross-check accuracy.** Each false positive (country aliases, `1.234` vs `1,234`, split product lines, freight on the invoice total, evidence that exists but does not contain the value) got a failing test before the fix. The real weight mismatch on the demo still produces its finding.
- **Day 6, database security.** A SQL script (`supabase/checks/day6_security_checks.sql`) and a PowerShell guide let the owner prove the rules on the real project. Those owner runs are still pending (see `docs/DAILY_PROGRESS.md`).
- **Day 7, Alerts and Documents pages.** They were placeholders that only listed shipments. Now they list all findings and documents with search, filters and pagination, backed by two read-only endpoints.

**Not verified by Kiro.** The browser rendering of most pages, Lighthouse, real Supabase isolation checks, and anything on a deployed server. Those are tracked in `docs/DAILY_PROGRESS.md` and `docs/E2E_CHECKLIST.md`.
