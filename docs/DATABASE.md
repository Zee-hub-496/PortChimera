# Database design

Migration: `supabase/migrations/0001_initial_schema.sql`.

> **Status:** written, **not yet run** against a real Postgres. See "Validating the migration" below.
> This line must be updated once it has been run.

## How the tables relate

```
auth.users (managed by Supabase)
   ├── profiles                1:1   extra per-user data
   ├── shipments               1:N   everything belongs to a shipment
   │     ├── documents         1:N   (max one per type: invoice, packing list, certificate of origin)
   │     │     └── document_extractions  1:1  raw AI output + human-reviewed version
   │     ├── line_items        1:N   products read from the documents
   │     │     ├── hs_suggestions    1:N  AI-suggested HS code, human approval
   │     │     └── duty_estimates    1:N  deterministic duty result
   │     ├── discrepancies     1:N   cross-check findings
   │     └── route_results     1:N   saved routes (baseline and per-scenario)
   ├── disruption_scenarios    1:N   "what if Singapore strikes" setups, per user
   │     └── scenario_effects  1:N   each closes one port OR one edge
   └── audit_logs              1:N   append-only history

Shared reference data (read-only to users):
   ports ──< shipping_edges        the shipping graph: ports are nodes, edges are lanes
   tariff_rates                    cited Pakistan duty rates (curated subset)
   exchange_rates                  dated currency rates to PKR
```

## Design decisions in plain language

**Ownership flows down from the shipment.** Only `shipments` stores `user_id` directly. Documents, line items,
discrepancies and so on belong to a shipment, and a policy asks "is the parent shipment mine?". This keeps
ownership in one place instead of copying `user_id` into every table and risking mismatches.

**Row Level Security (RLS) is the second lock.** The API checks ownership in code, and the database
refuses to return another user's rows even if the code has a bug. A table with RLS on and no policy for an
action rejects that action. That is why `audit_logs` has no update or delete policy: history cannot be rewritten.

**Disruptions never touch the shared graph.** A strike on Singapore is a row in `scenario_effects` that belongs
to one user. At routing time the API loads the shared `ports` and `shipping_edges`, then removes whatever the
active scenario closes, in memory. Two users can simulate different crises at once, and "restore" just
means turning the scenario off.

**AI output and human decisions are stored separately.** `document_extractions.payload` is exactly what the AI
returned. `reviewed_payload` is what the person approved. `hs_suggestions.suggested_code` is the AI's guess;
`approved_code` is only set by a human. The `check` constraint requires `approved_code` and `approved_at` to be set together.

**Edges are directed.** Shanghai -> Singapore and Singapore -> Shanghai are two rows. Two-way lanes need both rows
in the seed data. Directed edges also allow asymmetric costs later.

**`shipping_edges.distance_km` exists for the A\* heuristic.** The heuristic needs a minimum cost per kilometre
across all edges. Each edge must therefore store a distance at least as long as the straight-line distance
between its ports; a seed-data test will enforce this.

**Illustrative data is labeled.** `ports`, `shipping_edges`, `exchange_rates` and `route_results` carry a
`data_label` so the UI can say "illustrative" or "demo" instead of implying real quotes.

**Enumerations are `text` + `check`.** Easier to change in a later migration than Postgres `enum` types.

**Storage.** A private bucket `documents` accepts only PDF/JPEG/PNG up to 5 MB, and storage policies require
the first folder in the object path to be the uploader's user id.

## Validating the migration

1. Create a Supabase project (free tier).
2. Open **SQL Editor**, paste `0001_initial_schema.sql`, run it. Fix any error and re-run on a fresh project.
3. Create two test users in **Authentication**. Using each user's token, check that user A cannot read user B's
   shipment (the API security tests will automate this in the foundation spec, task 6).
4. Change the status line at the top of this file to say what was run and when.

## Not in this migration yet

- Seed data (ports, edges, tariff rows, exchange rates): added by the routing and customs specs, each with its source noted.
- Indexes beyond foreign keys and obvious filters: add only when a real query is slow.
