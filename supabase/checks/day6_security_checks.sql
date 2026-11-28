-- Day 6 security checks. Run in the Supabase SQL Editor AFTER applying migration 0004.
--
-- Nothing to edit. ALICE is the owner of the oldest shipment (your own account). BOB is any other
-- user. You need at least two accounts and one shipment: register a second account on the app first.
--
-- The result is ONE table at the bottom of the output: a row per check with PASS or FAIL.
-- Nothing is left changed. Every write that a check tries is rolled back inside the check itself,
-- so even a FAIL does not damage your data. Safe to run more than once.
-- The REST and Storage checks with two real sessions are in docs/DAY6_SECURITY_TEST.md.

drop table if exists day6_results;
create temp table day6_results (check_no text, outcome text, detail text);

-- 0. Setup: two accounts, a shipment, and Row Level Security on for every public table.
do $$
declare a uuid; b uuid; open_tables text;
begin
  select user_id into a from public.shipments order by created_at limit 1;
  select id into b from auth.users
    where id is distinct from a order by created_at limit 1;
  select string_agg(tablename, ', ') into open_tables
    from pg_tables where schemaname = 'public' and not rowsecurity;
  if a is null or b is null then
    insert into day6_results values ('0', 'FAIL', 'need two accounts and one shipment: register a second account and create a shipment first');
  elsif open_tables is not null then
    insert into day6_results values ('0', 'FAIL', 'RLS is off on: ' || open_tables);
  else
    insert into day6_results values ('0', 'PASS', 'two accounts found, a shipment exists, RLS is on for every public table');
  end if;
end $$;

-- 1. The protect trigger is installed.
insert into day6_results
select '1',
  case when exists (select 1 from pg_trigger where tgname = 'shipments_protect_status' and not tgisinternal)
       then 'PASS' else 'FAIL' end,
  case when exists (select 1 from pg_trigger where tgname = 'shipments_protect_status' and not tgisinternal)
       then 'trigger shipments_protect_status exists' else 'trigger is missing: apply migration 0004' end;

-- 2. ALICE cannot set her own shipment status directly (what a forged REST PATCH does).
do $$
declare a uuid; s uuid; outcome text;
begin
  select user_id into a from public.shipments order by created_at limit 1;
  select id into s from public.shipments where user_id = a order by created_at limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    begin
      update public.shipments set status = 'ai_pre_cleared' where id = s;
      outcome := 'FAIL|ALICE changed her own status';
    exception when insufficient_privilege then
      outcome := 'PASS|forged status update was rejected (42501)';
    end;
    raise exception 'undo';
  exception when raise_exception then null;
  end;
  execute 'reset role';
  insert into day6_results values ('2', split_part(outcome, '|', 1), split_part(outcome, '|', 2));
exception when others then
  execute 'reset role';
  insert into day6_results values ('2', 'FAIL', sqlerrm);
end $$;

-- 3. ALICE can still change other columns of her shipment (no regression).
do $$
declare a uuid; s uuid; n int;
begin
  select user_id into a from public.shipments order by created_at limit 1;
  select id into s from public.shipments where user_id = a order by created_at limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    update public.shipments set cross_check_summary = cross_check_summary where id = s;
    get diagnostics n = row_count;
    raise exception 'undo';
  exception when raise_exception then null;
  end;
  execute 'reset role';
  insert into day6_results values ('3', case when n = 1 then 'PASS' else 'FAIL' end,
    case when n = 1 then 'a normal update of her own shipment still works' else 'normal update touched ' || n || ' rows' end);
exception when others then
  execute 'reset role';
  insert into day6_results values ('3', 'FAIL', sqlerrm);
end $$;

-- 4. ALICE cannot create a shipment that starts as something other than 'submitted'.
do $$
declare a uuid; outcome text;
begin
  select user_id into a from public.shipments order by created_at limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    begin
      insert into public.shipments (user_id, shipment_number, origin_country, destination_country, status)
      values (a, 'DAY6-CHECK', 'CN', 'PK', 'cleared');
      outcome := 'FAIL|insert with status cleared was accepted';
    exception when insufficient_privilege then
      outcome := 'PASS|insert with a forged status was rejected';
    end;
    raise exception 'undo';
  exception when raise_exception then null;
  end;
  execute 'reset role';
  insert into day6_results values ('4', split_part(outcome, '|', 1), split_part(outcome, '|', 2));
exception when others then
  execute 'reset role';
  insert into day6_results values ('4', 'FAIL', sqlerrm);
end $$;

-- 5. BOB cannot read, update or delete ALICE's shipment.
do $$
declare a uuid; b uuid; s uuid; seen int; changed int; removed int;
begin
  select user_id into a from public.shipments order by created_at limit 1;
  select id into b from auth.users where id is distinct from a order by created_at limit 1;
  select id into s from public.shipments where user_id = a order by created_at limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    select count(*) into seen from public.shipments where id = s;
    update public.shipments set shipment_number = shipment_number where id = s;
    get diagnostics changed = row_count;
    delete from public.shipments where id = s;
    get diagnostics removed = row_count;
    raise exception 'undo';
  exception when raise_exception then null;
  end;
  execute 'reset role';
  insert into day6_results values ('5',
    case when seen = 0 and changed = 0 and removed = 0 then 'PASS' else 'FAIL' end,
    'BOB saw ' || seen || ', changed ' || changed || ', deleted ' || removed || ' of ALICE''s shipment rows (all must be 0)');
exception when others then
  execute 'reset role';
  insert into day6_results values ('5', 'FAIL', sqlerrm);
end $$;

-- 6. BOB cannot read ALICE's documents, findings, extractions, line items or audit entries.
do $$
declare a uuid; b uuid; docs int; findings int; extractions int; items int; audits int;
begin
  select user_id into a from public.shipments order by created_at limit 1;
  select id into b from auth.users where id is distinct from a order by created_at limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into docs from public.documents d
    join public.shipments s on s.id = d.shipment_id where s.user_id = a;
  select count(*) into findings from public.discrepancies x
    join public.shipments s on s.id = x.shipment_id where s.user_id = a;
  select count(*) into extractions from public.document_extractions e
    join public.documents d on d.id = e.document_id
    join public.shipments s on s.id = d.shipment_id where s.user_id = a;
  select count(*) into items from public.line_items x
    join public.shipments s on s.id = x.shipment_id where s.user_id = a;
  select count(*) into audits from public.audit_logs where user_id = a;
  execute 'reset role';
  insert into day6_results values ('6',
    case when docs + findings + extractions + items + audits = 0 then 'PASS' else 'FAIL' end,
    'BOB sees documents ' || docs || ', findings ' || findings || ', extractions ' || extractions
      || ', line items ' || items || ', audit entries ' || audits || ' of ALICE (all must be 0)');
exception when others then
  execute 'reset role';
  insert into day6_results values ('6', 'FAIL', sqlerrm);
end $$;

-- 7. Audit entries cannot be edited or deleted by their owner.
do $$
declare a uuid; changed int; removed int;
begin
  select user_id into a from public.shipments order by created_at limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    update public.audit_logs set action = 'forged' where user_id = a;
    get diagnostics changed = row_count;
    delete from public.audit_logs where user_id = a;
    get diagnostics removed = row_count;
    raise exception 'undo';
  exception when raise_exception then null;
  end;
  execute 'reset role';
  insert into day6_results values ('7',
    case when changed = 0 and removed = 0 then 'PASS' else 'FAIL' end,
    'changed ' || changed || ', deleted ' || removed || ' audit rows (both must be 0)');
exception when others then
  execute 'reset role';
  insert into day6_results values ('7', 'FAIL', sqlerrm);
end $$;

-- 8. The server path still works: a privileged role (this editor, or the service role) may change status.
do $$
declare a uuid; s uuid; before_status text; after_status text;
begin
  select user_id into a from public.shipments order by created_at limit 1;
  select id, status into s, before_status from public.shipments where user_id = a order by created_at limit 1;
  begin
    update public.shipments
      set status = case when before_status = 'submitted' then 'requires_review' else 'submitted' end
      where id = s;
    select status into after_status from public.shipments where id = s;
    raise exception 'undo';
  exception when raise_exception then null;
  end;
  insert into day6_results values ('8',
    case when after_status is distinct from before_status then 'PASS' else 'FAIL' end,
    'privileged status change ' || before_status || ' to ' || coalesce(after_status, 'null') || ' (rolled back)');
exception when others then
  insert into day6_results values ('8', 'FAIL', sqlerrm);
end $$;

-- 9. Storage: only the three own-folder policies exist on storage.objects.
insert into day6_results
select '9',
  case when count(*) = 3 and count(*) filter (where policyname not in ('documents_bucket_select', 'documents_bucket_insert', 'documents_bucket_delete')) = 0
       then 'PASS' else 'CHECK' end,
  'policies: ' || coalesce(string_agg(policyname, ', ' order by policyname), 'none')
from pg_policies where schemaname = 'storage' and tablename = 'objects';

select * from day6_results order by check_no::int;
