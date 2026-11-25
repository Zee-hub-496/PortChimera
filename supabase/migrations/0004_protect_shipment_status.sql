-- Migration 0004 (Day 6): only the server may change shipments.status.
--
-- Before this, any signed-in user could call the Supabase REST API directly and set their own
-- shipment's status (for example to 'ai_pre_cleared'), skipping every check. The API now writes
-- status with the service-role key (server only); this trigger rejects the same write from a
-- browser session. See docs/DESIGN_STATUS_PROTECTION.md (Option A).
--
-- How the caller is told apart: the trigger is NOT security definer, so current_user is the
-- database role of the session. REST calls with a user's token run as 'authenticated' (or 'anon'),
-- calls with the service-role key run as 'service_role', and the Supabase SQL Editor runs as
-- 'postgres'. Only the first two are blocked, so you can still fix a row by hand in the SQL Editor.
--
-- Additive and reversible. Safe to run twice. Rollback:
--   drop trigger if exists shipments_protect_status on public.shipments;
--   drop function if exists public.protect_shipment_status();

create or replace function public.protect_shipment_status()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and new.status is distinct from 'submitted' then
      raise exception 'shipments.status is set by the server only'
        using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.status is distinct from old.status then
      raise exception 'shipments.status is set by the server only'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists shipments_protect_status on public.shipments;
create trigger shipments_protect_status
  before insert or update on public.shipments
  for each row execute function public.protect_shipment_status();
