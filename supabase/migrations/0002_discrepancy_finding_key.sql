-- Migration 0002: lets the cross-check (spec 04) re-run without losing decisions.
-- Additive only: it adds columns and one unique rule. Nothing is dropped or rewritten, and
-- migration 0001 is untouched. Safe to run once on a project that already ran 0001.

-- A stable name for each finding (for example "grossWeight|commercial_invoice+packing_list").
-- On a re-run the API matches new findings to stored ones by this key: open rows are replaced,
-- rows you accepted, resolved or dismissed are kept as they are.
alter table public.discrepancies add column finding_key text;
alter table public.discrepancies add column category text;
alter table public.discrepancies
  add constraint discrepancies_shipment_finding_key_unique unique (shipment_id, finding_key);

-- The summary of the latest cross-check (overall result, counts, fields that could not be compared).
alter table public.shipments add column cross_check_summary jsonb;
alter table public.shipments add column cross_checked_at timestamptz;
