---
inclusion: always
---

# Architecture

Modular monolith in an npm-workspaces monorepo. No microservices.

```
apps/web        React + Vite + Tailwind + React Router (deployed to Vercel)
apps/api        Express 5 REST API (deployed to Render)
packages/core   Pure JavaScript business logic: routing, crosscheck, customs
supabase/       SQL migrations and seed data
fixtures/       Synthetic documents only
```

## The dependency rule

`packages/core` must never import Express, React, Supabase, Gemini or anything with I/O.
It receives plain data and returns plain data. This keeps the important logic easy to test,
reusable by the API and a possible MCP server, and impossible to tangle with UI code.

Allowed direction: `web` -> HTTP -> `api` -> `core`. `web` never imports `core` for business decisions
(it may import display helpers later). `core` imports nothing from `apps/`.

## API module layout

Each feature under `apps/api/src/modules/<name>/` has: `routes.js` (URL wiring), `controller.js`
(HTTP in/out), `service.js` (use-case logic, calls core + repo), `repo.js` (database access),
`schemas.js` (zod request validation). Controllers stay thin; no business logic in routes or React.

## Key decisions (do not change without asking the author)

- **Auth:** Supabase Auth in the browser. The API only verifies the JWT. No custom register/login endpoints.
- **RLS:** the API queries Supabase with a client built from the _user's_ JWT so Row Level Security applies.
  The service-role key is used only for signing storage URLs and seeding, never for user data reads.
- **Disruptions are per-user scenario overlays** applied in memory at routing time. The shared
  `ports` and `shipping_edges` tables are never modified by a simulation.
- **A\* heuristic:** `h(n) = haversine(n, goal) * minCostPerKm`, where `minCostPerKm` is computed from
  the graph so the heuristic never overestimates (admissible). Tests compare A\* to Dijkstra.
- **Long AI work** runs in the background in the same process; the client polls `processing_status`.
- **Shipment status** is derived from state (documents, discrepancies, approvals), not edited by hand.
- **Money:** customs value in PKR needs a dated exchange-rate row and an Incoterm. Both are explicit inputs.
