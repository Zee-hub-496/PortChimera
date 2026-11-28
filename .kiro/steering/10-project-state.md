---
inclusion: always
---

# Project state and operations (read with `09-kiroween-execution.md`)

Facts a new session needs. They change; the dated "Current state" block in `docs/DAILY_PROGRESS.md` is the source of truth, and this file must be updated with it. No secrets belong here.

## Where things run

| Part                    | Where                                                                             | How it updates                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Web app                 | Vercel, https://port-chimera.vercel.app                                           | Builds on every merge to `main`; branch previews. `VITE_*` variables are baked in at build time, so changing one needs a redeploy.    |
| API                     | Render free web service, https://portchimera.onrender.com (health: `/api/health`) | Render deploys the `main` branch; confirm Auto-Deploy is "On Commit". Changing an environment variable restarts it. Sleeps when idle. |
| Database, Auth, Storage | Supabase free project                                                             | Migrations in `supabase/migrations/` (`0001` to `0004`) are run **by hand** in the SQL Editor; they never run automatically.          |
| Source and CI           | GitHub, https://github.com/Zee-hub-496/PortChimera, MIT                           | GitHub Actions on every PR and push: secret scan, lint, format check, tests, web build.                                               |

## Configuration (names only)

- API environment (Render): `NODE_ENV`, `NODE_VERSION`, `TRUST_PROXY_HOPS`, `CORS_ORIGIN` (exactly `https://port-chimera.vercel.app`), `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (status write only), `GEMINI_API_KEY`, `GEMINI_MODEL` (`gemini-3.5-flash-lite`).
- Web environment (Vercel): `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. The Supabase anon key is public by design.
- Supabase Auth URL Configuration: Site URL and Redirect URL are `https://port-chimera.vercel.app`.
- If `SUPABASE_SERVICE_ROLE_KEY` is missing while migration `0004` is applied, shipment status stops updating.

## What exists, in one paragraph

Shipments, three document types, Gemini extraction with evidence, human review, deterministic cross-check, derived shipment status, audit log, A\* routing, per-user crisis scenarios ("What if?" on the Route tab) and a Crisis monitor page (`GET /api/scenarios/impact`) listing which shipments each saved crisis affects. Alerts and Documents list pages with search, filters and pagination. Light and dark themes, monochrome palette. Seed network: 20 ports, 30 two-way lanes (60 directed edges), illustrative data.

## Working rules that came from mistakes

- The sandbox has no access to the live site, Render, Supabase or the Devpost rules page. Everything real is run by the owner. Record what the owner reports, with the date, and mark the rest NOT TESTED.
- Check that a PR is merged before pushing more commits to its branch; later commits do not reach `main` otherwise. The owner merges on GitHub.
- Use `gh api` for GitHub (not `gh pr`). Run `npx prettier --check .` and the tests before every push, and read CI afterwards.
- Do not claim Kiro features that were not used. Used: Kiro Web, Kiro IDE (clone, run locally, tests, push and pull), specs, steering, property-style tests. Not used: hooks, custom agents, MCP, Powers.
- Owner environment: Windows, PowerShell, `D:\KIRO\PortChimera`. Explain in plain language and give numbered steps.
