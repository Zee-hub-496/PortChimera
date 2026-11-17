# PortChimera

Customs intelligence and crisis-aware logistics, built for **Kiroween 2026 (Frankenstein category)**.

The "chimera" is three technologies stitched into one system:

1. **AI (Gemini)** reads shipping documents and suggests classifications. It is never treated as a source of truth.
2. **Deterministic code** validates, compares and calculates. It makes the decisions.
3. **A\* search** chooses shipping routes and re-plans them when a port is disrupted.

## Current status (honest)

This project is under active development. Nothing below should be read as a finished feature.

| Area                                                            | Status                                                                              |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Monorepo, config, error handling, secret scanner                | Built. 17 of 17 tests pass on Windows with Node 24; API and web dev servers start.  |
| A* routing, disruption overlay and comparison (`packages/core`) | Built with 20-port demo seed data; 112 tests pass in the sandbox. No API or UI yet. |
| Database migration                                              | Written, **not yet run** against Postgres                                           |
| Auth, documents, customs, cross-check, simulation, dashboard    | Specified in `.kiro/specs/`, **not built yet**                                      |

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
