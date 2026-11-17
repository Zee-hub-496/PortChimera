-- PortChimera initial schema.
-- Run in the Supabase SQL editor, or with `supabase db reset` / `supabase db push`.
-- Every table has Row Level Security (RLS) enabled in this same file.
--
-- STATUS: written but NOT yet executed against a real Postgres. Validate it first (see docs/DATABASE.md).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reference data (shared by everyone, read-only through the API)
-- ---------------------------------------------------------------------------

create table public.ports (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,                       -- UN/LOCODE style, e.g. CNSHA
  name       text not null,
  country    text not null,                              -- ISO 3166-1 alpha-2, e.g. CN
  lat        double precision not null check (lat between -90 and 90),
  lon        double precision not null check (lon between -180 and 180),
  data_label text not null default 'illustrative'
);

-- Directed edge: a shipping lane from one port to another. Seed both directions for two-way lanes.
create table public.shipping_edges (
  id                  uuid primary key default gen_random_uuid(),
  source_port_id      uuid not null references public.ports (id) on delete cascade,
  destination_port_id uuid not null references public.ports (id) on delete cascade,
  distance_km         numeric not null check (distance_km > 0),   -- used by the A* heuristic
  transit_days        numeric not null check (transit_days > 0),
  freight_cost_usd    numeric not null check (freight_cost_usd >= 0),
  risk_score          numeric not null check (risk_score between 0 and 1),
  data_label          text not null default 'illustrative',
  check (source_port_id <> destination_port_id),
  unique (source_port_id, destination_port_id)
);
create index shipping_edges_source_idx on public.shipping_edges (source_port_id);
create index shipping_edges_destination_idx on public.shipping_edges (destination_port_id);

-- Tariff rows are copied by hand from a cited official source. No rate is ever assumed or guessed.
create table public.tariff_rates (
  id                  uuid primary key default gen_random_uuid(),
  jurisdiction        text not null default 'PK',
  hs_code             text not null,                      -- national tariff line, e.g. 8 digits for Pakistan
  description         text not null,
  customs_duty_pct    numeric not null check (customs_duty_pct >= 0),
  additional_duty_pct numeric not null default 0 check (additional_duty_pct >= 0),
  regulatory_duty_pct numeric not null default 0 check (regulatory_duty_pct >= 0),
  sales_tax_pct       numeric not null default 0 check (sales_tax_pct >= 0),
  income_tax_pct      numeric not null default 0 check (income_tax_pct >= 0),
  effective_from      date not null,
  effective_to        date,
  source_url          text not null,
  source_note         text,
  unique (jurisdiction, hs_code, effective_from)
);
create index tariff_rates_lookup_idx on public.tariff_rates (jurisdiction, hs_code);

-- Customs value is needed in PKR, so every conversion cites a dated rate.
create table public.exchange_rates (
  id          uuid primary key default gen_random_uuid(),
  currency    text not null check (char_length(currency) = 3),
  rate_to_pkr numeric not null check (rate_to_pkr > 0),
  as_of       date not null,
  source      text not null,
  data_label  text not null default 'demo',
  unique (currency, as_of)
);

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

-- Supabase already stores credentials in auth.users. profiles holds our own per-user data.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Shipments and documents
-- ---------------------------------------------------------------------------

create table public.shipments (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  shipment_number      text not null,
  origin_country       text not null,
  destination_country  text not null,
  origin_port_id       uuid references public.ports (id),
  destination_port_id  uuid references public.ports (id),
  incoterm             text check (incoterm in ('EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP')),
  -- Derived by the API from documents, discrepancies and approvals; not edited by hand.
  -- 'ai_pre_cleared' is an INTERNAL status and never implies government clearance.
  status               text not null default 'submitted'
                       check (status in ('submitted','ai_processing','requires_review','ai_pre_cleared','cleared')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, shipment_number)
);
create index shipments_user_idx on public.shipments (user_id);
create trigger shipments_set_updated_at
  before update on public.shipments
  for each row execute function public.set_updated_at();

create table public.documents (
  id                uuid primary key default gen_random_uuid(),
  shipment_id       uuid not null references public.shipments (id) on delete cascade,
  document_type     text not null check (document_type in ('commercial_invoice','packing_list','certificate_of_origin')),
  storage_path      text not null unique,               -- generated by us, never from the user's filename
  original_filename text not null,
  mime_type         text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  size_bytes        integer not null check (size_bytes > 0),
  sha256            text not null,                      -- also the cache key for AI results
  processing_status text not null default 'uploaded'
                    check (processing_status in ('uploaded','processing','extracted','failed','reviewed')),
  error_message     text,
  created_at        timestamptz not null default now(),
  unique (shipment_id, document_type)                   -- MVP: one document of each type per shipment
);
create index documents_shipment_idx on public.documents (shipment_id);
create index documents_sha256_idx on public.documents (sha256);

-- Raw AI output (payload) is kept separate from what the human approved (reviewed_payload).
-- payload shape per field: { value, confidence, status, evidence, evidence_verified }
create table public.document_extractions (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid not null unique references public.documents (id) on delete cascade,
  payload          jsonb not null,
  reviewed_payload jsonb,
  model            text not null,
  schema_version   integer not null,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now()
);

create table public.line_items (
  id                 uuid primary key default gen_random_uuid(),
  shipment_id        uuid not null references public.shipments (id) on delete cascade,
  source_document_id uuid references public.documents (id) on delete set null,
  line_no            integer not null check (line_no > 0),
  description        text not null,
  quantity           numeric check (quantity >= 0),
  unit               text,
  unit_price         numeric check (unit_price >= 0),
  total_value        numeric check (total_value >= 0),
  currency           text check (char_length(currency) = 3),
  net_weight_kg      numeric check (net_weight_kg >= 0),
  gross_weight_kg    numeric check (gross_weight_kg >= 0),
  origin_country     text,
  created_at         timestamptz not null default now(),
  unique (shipment_id, source_document_id, line_no)
);
create index line_items_shipment_idx on public.line_items (shipment_id);

-- ---------------------------------------------------------------------------
-- Customs
-- ---------------------------------------------------------------------------

create table public.hs_suggestions (
  id             uuid primary key default gen_random_uuid(),
  shipment_id    uuid not null references public.shipments (id) on delete cascade,
  line_item_id   uuid not null references public.line_items (id) on delete cascade,
  suggested_code text not null,
  confidence     numeric check (confidence between 0 and 1),
  explanation    text not null,
  model          text not null,
  approved_code  text,                                   -- set only by a human
  approved_by    uuid references auth.users (id),
  approved_at    timestamptz,
  tariff_rate_id uuid references public.tariff_rates (id),
  created_at     timestamptz not null default now(),
  check ((approved_code is null) = (approved_at is null))
);
create index hs_suggestions_shipment_idx on public.hs_suggestions (shipment_id);
create index hs_suggestions_line_item_idx on public.hs_suggestions (line_item_id);

-- Result of the deterministic duty calculation. 'unverified' means no tariff row was found.
create table public.duty_estimates (
  id                uuid primary key default gen_random_uuid(),
  shipment_id       uuid not null references public.shipments (id) on delete cascade,
  line_item_id      uuid not null references public.line_items (id) on delete cascade,
  tariff_rate_id    uuid references public.tariff_rates (id),
  exchange_rate_id  uuid references public.exchange_rates (id),
  customs_value_pkr numeric check (customs_value_pkr >= 0),
  breakdown         jsonb,
  total_duty_pkr    numeric check (total_duty_pkr >= 0),
  status            text not null check (status in ('estimated','unverified')),
  computed_at       timestamptz not null default now()
);
create index duty_estimates_shipment_idx on public.duty_estimates (shipment_id);

-- ---------------------------------------------------------------------------
-- Cross-checking
-- ---------------------------------------------------------------------------

create table public.discrepancies (
  id                 uuid primary key default gen_random_uuid(),
  shipment_id        uuid not null references public.shipments (id) on delete cascade,
  field_name         text not null,
  severity           text not null check (severity in ('critical','high','medium','low')),
  document_values    jsonb not null,                     -- e.g. {"commercial_invoice": 500, "packing_list": 650}
  difference         jsonb,                              -- e.g. {"absolute": 150, "percent": 30, "unit": "kg"}
  explanation        text not null,
  recommended_action text not null,
  review_status      text not null default 'open' check (review_status in ('open','accepted','resolved','dismissed')),
  reviewed_by        uuid references auth.users (id),
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now()
);
create index discrepancies_shipment_idx on public.discrepancies (shipment_id);

-- ---------------------------------------------------------------------------
-- Disruption scenarios (per user, so simulations never change the shared graph)
-- ---------------------------------------------------------------------------

create table public.disruption_scenarios (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  is_active  boolean not null default false,
  created_at timestamptz not null default now()
);
create index disruption_scenarios_user_idx on public.disruption_scenarios (user_id);

-- Each effect closes one port OR one edge while the scenario is active.
create table public.scenario_effects (
  id          uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.disruption_scenarios (id) on delete cascade,
  port_id     uuid references public.ports (id) on delete cascade,
  edge_id     uuid references public.shipping_edges (id) on delete cascade,
  effect_type text not null check (effect_type in ('port_strike','severe_weather','port_congestion','connection_failure')),
  note        text,
  created_at  timestamptz not null default now(),
  check ((port_id is not null) <> (edge_id is not null))   -- exactly one of the two
);
create index scenario_effects_scenario_idx on public.scenario_effects (scenario_id);

-- ---------------------------------------------------------------------------
-- Routes and audit
-- ---------------------------------------------------------------------------

create table public.route_results (
  id            uuid primary key default gen_random_uuid(),
  shipment_id   uuid not null references public.shipments (id) on delete cascade,
  scenario_id   uuid references public.disruption_scenarios (id) on delete set null,  -- null = baseline route
  objective     text not null check (objective in ('fastest','cheapest','lowest_risk')),
  weights       jsonb not null,                           -- {"time":..,"cost":..,"risk":..}
  path          jsonb not null,                           -- ordered port codes
  total_days    numeric not null,
  total_cost_usd numeric not null,
  risk_score    numeric not null,
  explanation   text,
  data_label    text not null default 'illustrative',
  created_at    timestamptz not null default now()
);
create index route_results_shipment_idx on public.route_results (shipment_id);

-- Insert-only: there are deliberately no update or delete policies below.
create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  shipment_id uuid references public.shipments (id) on delete set null,
  action      text not null,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_user_idx on public.audit_logs (user_id, created_at desc);
create index audit_logs_shipment_idx on public.audit_logs (shipment_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Ownership helpers used by policies.
-- SECURITY DEFINER lets them read the parent table without re-triggering that table's own policy.
-- They still compare against auth.uid(), so they only ever answer "is this MINE?".
-- ---------------------------------------------------------------------------

create or replace function public.owns_shipment(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shipments s where s.id = sid and s.user_id = auth.uid());
$$;

create or replace function public.owns_document(did uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.documents d
    join public.shipments s on s.id = d.shipment_id
    where d.id = did and s.user_id = auth.uid()
  );
$$;

create or replace function public.owns_scenario(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.disruption_scenarios d where d.id = sid and d.user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.ports                 enable row level security;
alter table public.shipping_edges        enable row level security;
alter table public.tariff_rates          enable row level security;
alter table public.exchange_rates        enable row level security;
alter table public.profiles              enable row level security;
alter table public.shipments             enable row level security;
alter table public.documents             enable row level security;
alter table public.document_extractions  enable row level security;
alter table public.line_items            enable row level security;
alter table public.hs_suggestions        enable row level security;
alter table public.duty_estimates        enable row level security;
alter table public.discrepancies         enable row level security;
alter table public.disruption_scenarios  enable row level security;
alter table public.scenario_effects      enable row level security;
alter table public.route_results         enable row level security;
alter table public.audit_logs            enable row level security;

-- Reference data: any signed-in user may read; nobody can write through the API.
create policy ports_read          on public.ports          for select to authenticated using (true);
create policy shipping_edges_read on public.shipping_edges for select to authenticated using (true);
create policy tariff_rates_read   on public.tariff_rates   for select to authenticated using (true);
create policy exchange_rates_read on public.exchange_rates for select to authenticated using (true);

-- Profiles: your own row only. Inserts come from the trigger, not from clients.
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Shipments: owner has full control.
create policy shipments_owner_select on public.shipments for select to authenticated using (user_id = auth.uid());
create policy shipments_owner_insert on public.shipments for insert to authenticated with check (user_id = auth.uid());
create policy shipments_owner_update on public.shipments for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy shipments_owner_delete on public.shipments for delete to authenticated using (user_id = auth.uid());

-- Children of a shipment: allowed only when the parent shipment is yours.
create policy documents_owner on public.documents for all to authenticated
  using (public.owns_shipment(shipment_id)) with check (public.owns_shipment(shipment_id));
create policy line_items_owner on public.line_items for all to authenticated
  using (public.owns_shipment(shipment_id)) with check (public.owns_shipment(shipment_id));
create policy hs_suggestions_owner on public.hs_suggestions for all to authenticated
  using (public.owns_shipment(shipment_id)) with check (public.owns_shipment(shipment_id));
create policy duty_estimates_owner on public.duty_estimates for all to authenticated
  using (public.owns_shipment(shipment_id)) with check (public.owns_shipment(shipment_id));
create policy discrepancies_owner on public.discrepancies for all to authenticated
  using (public.owns_shipment(shipment_id)) with check (public.owns_shipment(shipment_id));
create policy route_results_owner on public.route_results for all to authenticated
  using (public.owns_shipment(shipment_id)) with check (public.owns_shipment(shipment_id));

create policy document_extractions_owner on public.document_extractions for all to authenticated
  using (public.owns_document(document_id)) with check (public.owns_document(document_id));

-- Scenarios and their effects.
create policy scenarios_owner on public.disruption_scenarios for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy scenario_effects_owner on public.scenario_effects for all to authenticated
  using (public.owns_scenario(scenario_id)) with check (public.owns_scenario(scenario_id));

-- Audit log: you can read and add your own entries. No update or delete policy exists, so none are allowed.
create policy audit_logs_select_own on public.audit_logs for select to authenticated using (user_id = auth.uid());
create policy audit_logs_insert_own on public.audit_logs for insert to authenticated with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Private storage bucket for uploaded documents.
-- Objects must live under a folder named after the uploader's user id: <user_id>/<shipment_id>/<uuid>
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 5242880, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;

create policy documents_bucket_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy documents_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy documents_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
