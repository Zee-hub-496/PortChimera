---
inclusion: fileMatch
fileMatchPattern: 'supabase/**'
---

# Database conventions

- Postgres on Supabase. All schema changes are SQL files in `supabase/migrations/`, numbered `0001_...sql`. Never edit an applied migration; add a new one.
- `snake_case`, plural table names, `uuid` primary keys (`gen_random_uuid()`), `created_at timestamptz default now()`.
- Foreign keys always declared with an explicit `on delete` rule. Index every foreign key and every column used in filters.
- Enumerations use `text` + `check (...)` constraints so they are easy to change in a later migration.
- Row Level Security is **enabled on every table** in the same migration that creates it. A table without policies is closed by default, which is the safe state.
- User-owned rows carry `user_id uuid references auth.users` or belong to a shipment that does. Policies compare against `auth.uid()`.
- Reference data (`ports`, `shipping_edges`, `tariff_rates`, `exchange_rates`) is readable by any signed-in user and writable by nobody through the API.
- `audit_logs` is insert-only: no update or delete policies.
- JSONB only for genuinely flexible payloads (AI extraction output, route paths, audit details). Anything queried or compared goes in real columns.
- Illustrative or simulated data carries a `data_label` column so the UI can show it.
