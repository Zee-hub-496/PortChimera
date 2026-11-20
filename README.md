# PortChimera

Customs intelligence and crisis-aware logistics, built for **Kiroween 2026 (Frankenstein category)**.

The "chimera" is three technologies stitched into one system:

1. **AI (Gemini)** reads shipping documents and suggests classifications. It is never treated as a source of truth.
2. **Deterministic code** validates, compares and calculates. It makes the decisions.
3. **A\* search** chooses shipping routes and re-plans them when a port is disrupted.

## Current status

This project is under active development. Nothing below should be read as a finished feature.

| Area                                                            | Status                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo, config, error handling, secret scanner                | Built. 120 of 120 tests passed on Windows with Node 24 (before the cross-checker was added); API and web dev servers start.                                                                                                                                                                                                                                |
| A* routing, disruption overlay and comparison (`packages/core`) | Built with 20-port demo seed data; 194 non-network tests pass in the sandbox (all core, seed and error-handler tests). No API or UI yet.                                                                                                                                                                                                                   |
| Cross-document checker (`packages/core`)                        | Built: compares invoice, packing list and certificate of origin. Tested on synthetic fixtures.                                                                                                                                                                                                                                                             |
| Database migration                                              | Written, **not yet run** against Postgres                                                                                                                                                                                                                                                                                                                  |
| API login protection (`apps/api`)                               | Token middleware, `/api/auth/me` handler and audit helper tested with fakes. Route wiring and env rules written, **not yet run**. Not tried against a real Supabase project. See `docs/SETUP_SUPABASE.md`.                                                                                                                                                 |
| Shipments and route API (`apps/api`)                            | Create, list, get shipments, `GET /api/ports` and `POST /api/routes/calculate` written. Logic tested with fakes in the sandbox; Express and zod wiring **not yet run**.                                                                                                                                                                                    |
| Web login, shipments page, route page (`apps/web`)              | Written. Pure helpers (API envelope, form validation, route formatting, map projection) tested. Pages, Vite build and real Supabase sign in **not yet run**. Steps: `docs/MILESTONE_LOGIN_SHIPMENTS.md`.                                                                                                                                                   |
| Document upload and AI extraction (`apps/api`, `apps/web`)      | Written. File checks, PDF text reader, evidence check, Gemini REST provider (fake fetch) and document service tested in the sandbox. Express routes, zod schemas, React page, real Supabase and the **real Gemini API have not been run**. Steps: `docs/MILESTONE_DOCUMENTS.md`, notes: `docs/AI_NOTES.md`.                                                |
| Cross-check in the app (`apps/api`, `apps/web`)                 | Written: reviewed documents are mapped, checked, stored in `discrepancies` (migration 0002, **not yet run**), with accept, resolve and dismiss decisions and a web page. Logic and handlers tested with fakes in the sandbox; Express, zod, React and real Supabase **not yet run**. Steps: `docs/MILESTONE_CROSSCHECK.md`. AI explanations are not built. |
| UI redesign (`apps/web`)                                        | Written: light, dark and system theme, landing page, split-screen login and register, app shell with sidebar and Ctrl+K search, shipment tabs, and a MapLibre map with CARTO tiles. Pure logic tested in the sandbox. `npm install`, the build, rendering, the new dependencies and the map are **NOT run**. Steps: `docs/MILESTONE_UI.md`.                |
| Customs and duty, scenario API and UI, dashboard                | Specified in `.kiro/specs/`, **not built yet**                                                                                                                                                                                                                                                                                                             |

Progress is tracked in the task lists under `.kiro/specs/*/tasks.md`.

## Repository layout

```
apps/web         React + Vite + Tailwind frontend
apps/api         Express API
packages/core    Framework-independent logic (routing, cross-check, customs math)
supabase/        SQL migrations and seed data
fixtures/        Synthetic documents only (never real customer data)
docs/            Database design, algorithms, Kiro usage, demo script
.kiro/           Steering files and specs used to build this with Kiro
```

## Run it

Requires Node 22 or newer.

```bash
npm install
cp .env.example apps/api/.env      # then fill in values; never commit this file
npm test                            # all tests
npm run dev:api                     # API on http://localhost:4000
npm run dev:web                     # web on http://localhost:5173
```

Real keys stay in untracked `.env` files and in the Render, Vercel and Supabase dashboards.
Run `npm run scan:secrets` before committing.

## Limitations (planned to stay true)

- Port and lane data is **illustrative**, not live or quoted.
- Tariff estimates cover a small curated set of Pakistan codes and are **estimates, not customs declarations**.
- "AI Pre-Cleared" and "Cleared" are internal statuses, not customs authority decisions.
- Demo documents are synthetic.

## Documentation

- `docs/DATABASE.md`: schema and how the tables relate
- `docs/KIRO_USAGE.md`: how Kiro specs, steering and workflows were used
- `.kiro/steering/`: project rules Kiro follows in every session
