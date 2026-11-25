-- Day 6 security checks. Run in the Supabase SQL Editor AFTER applying migration 0004.
--
-- Before running: replace the two emails below (search and replace in the editor) with two
-- real accounts of yours. ALICE must own at least one shipment; BOB must be a different user.
--   ALICE_EMAIL  -> e.g. you@example.com
--   BOB_EMAIL    -> e.g. second@example.com
--
-- Each block prints one line in the "Results" / Messages area: PASS or FAIL with a reason.
-- Nothing is left changed: check 8 flips one status and puts it back, the others only try writes
-- that must be refused or that touch zero rows. Safe to run more than once.
-- These checks use the database roles directly. The REST and Storage API checks with two real
-- sessions are in docs/DAY6_SECURITY_TEST.md.

-- 0. Setup facts: both users exist, ALICE has a shipment, no table has RLS switched off.
do $$
declare a uuid; b uuid; s uuid; open_tables text;
begin
  select id into a from auth.users where email = 'ALICE_EMAIL';
  select id into b from auth.users where email = 'BOB_EMAIL';
  select id into s from public.shipments where user_id = a limit 1;
  if a is null or b is null then raise exception 'FAIL setup: one of the two emails was not found'; end if;
  if s is null then raise exception 'FAIL setup: ALICE has no shipment, create one in the app first'; end if;
  select string_agg(tablename, ', ') into open_tables
    from pg_tables where schemaname = 'public' and not rowsecurity;
  if open_tables is not null then raise exception 'FAIL setup: RLS is off on: %', open_tables; end if;
  raise notice 'PASS 0 setup: users found, ALICE has a shipment, RLS is on for every public table';
end $$;

-- 1. The protect trigger is installed.
do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'shipments_protect_status' and not tgisinternal) then
    raise notice 'PASS 1 trigger shipments_protect_status exists';
  else
    raise exception 'FAIL 1 trigger is missing: apply migration 0004 first';
  end if;
end $$;

-- 2. ALICE cannot set her own shipment status directly (what a forged REST PATCH does).
do $$
declare a uuid; s uuid;
begin
  select id into a from auth.users where email = 'ALICE_EMAIL';
  select id into s from public.shipments where user_id = a limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    update public.shipments set status = 'ai_pre_cleared' where id = s;
    execute 'reset role';
    raise exception 'FAIL 2 ALICE changed her own status';
  exception when insufficient_privilege then
    execute 'reset role';
    raise notice 'PASS 2 forged status update was rejected (42501)';
  end;
end $$;

-- 3. ALICE can still change other columns of her shipment (no regression).
do $$
declare a uuid; s uuid; n int;
begin
  select id into a from auth.users where email = 'ALICE_EMAIL';
  select id into s from public.shipments where user_id = a limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.shipments set cross_check_summary = cross_check_summary where id = s;
  get diagnostics n = row_count;
  execute 'reset role';
  if n = 1 then raise notice 'PASS 3 a normal update of her own shipment still works';
  else raise exception 'FAIL 3 normal update touched % rows', n; end if;
end $$;

-- 4. ALICE cannot create a shipment that starts as something other than 'submitted'.
do $$
declare a uuid; o uuid; d uuid;
begin
  select id into a from auth.users where email = 'ALICE_EMAIL';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.shipments (user_id, shipment_number, origin_country, destination_country, status)
    values (a, 'DAY6-CHECK', 'CN', 'PK', 'cleared');
    execute 'reset role';
    raise exception 'FAIL 4 insert with status cleared was accepted';
  exception when insufficient_privilege then
    execute 'reset role';
    raise notice 'PASS 4 insert with a forged status was rejected';
  end;
end $$;

-- 5. BOB sees none of ALICE's rows, and cannot change or delete them.
do $$
declare a uuid; b uuid; s uuid; seen int; changed int; removed int;
begin
  select id into a from auth.users where email = 'ALICE_EMAIL';
  select id into b from auth.users where email = 'BOB_EMAIL';
  select id into s from public.shipments where user_id = a limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into seen from public.shipments where id = s;
  update public.shipments set shipment_number = shipment_number where id = s;
  get diagnostics changed = row_count;
  delete from public.shipments where id = s;
  get diagnostics removed = row_count;
  execute 'reset role';
  if seen = 0 and changed = 0 and removed = 0 then
    raise notice 'PASS 5 BOB cannot read, update or delete ALICE''s shipment';
  else
    raise exception 'FAIL 5 BOB saw %, changed %, deleted % rows', seen, changed, removed;
  end if;
end $$;

-- 6. BOB cannot read ALICE's documents, findings, extractions, line items or audit entries.
do $$
declare a uuid; b uuid; leaked int := 0; n int; t text;
begin
  select id into a from auth.users where email = 'ALICE_EMAIL';
  select id into b from auth.users where email = 'BOB_EMAIL';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  foreach t in array array['documents','document_extractions','discrepancies','line_items','route_results','disruption_scenarios'] loop
    execute format('select count(*) from public.%I', t) into n;
    -- BOB may own rows of his own; only rows that belong to ALICE count as a leak.
    if t = 'documents' then
      select count(*) into n from public.documents d join public.shipments s on s.id = d.shipment_id where s.user_id = a;
    elsif t = 'disruption_scenarios' then
      select count(*) into n from public.disruption_scenarios where user_id = a;
    elsif t = 'discrepancies' then
      select count(*) into n from public.discrepancies x join public.shipments s on s.id = x.shipment_id where s.user_id = a;
    elsif t = 'line_items' then
      select count(*) into n from public.line_items x join public.shipments s on s.id = x.shipment_id where s.user_id = a;
    elsif t = 'route_results' then
      select count(*) into n from public.route_results x join public.shipments s on s.id = x.shipment_id where s.user_id = a;
    else
      select count(*) into n from public.document_extractions e join public.documents d on d.id = e.document_id join public.shipments s on s.id = d.shipment_id where s.user_id = a;
    end if;
    leaked := leaked + n;
  end loop;
  select count(*) into n from public.audit_logs where user_id = a;
  leaked := leaked + n;
  execute 'reset role';
  if leaked = 0 then raise notice 'PASS 6 BOB sees none of ALICE''s child rows or audit entries';
  else raise exception 'FAIL 6 BOB can see % of ALICE''s rows', leaked; end if;
end $$;

-- 7. Audit log history cannot be edited or deleted by a user.
do $$
declare a uuid; changed int; removed int;
begin
  select id into a from auth.users where email = 'ALICE_EMAIL';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.audit_logs set action = 'forged' where user_id = a;
  get diagnostics changed = row_count;
  delete from public.audit_logs where user_id = a;
  get diagnostics removed = row_count;
  execute 'reset role';
  if changed = 0 and removed = 0 then raise notice 'PASS 7 audit entries cannot be changed or deleted';
  else raise exception 'FAIL 7 changed %, deleted % audit rows', changed, removed; end if;
end $$;

-- 8. The server path still works: the SQL Editor role (and the service role) may change status.
--    It flips one shipment's status and restores it in the same block.
do $$
declare a uuid; s uuid; before_status text; after_status text;
begin
  select id into a from auth.users where email = 'ALICE_EMAIL';
  select id, status into s, before_status from public.shipments where user_id = a limit 1;
  update public.shipments set status = case when before_status = 'submitted' then 'requires_review' else 'submitted' end where id = s;
  select status into after_status from public.shipments where id = s;
  update public.shipments set status = before_status where id = s;
  if after_status is distinct from before_status then
    raise notice 'PASS 8 a privileged role can still change status (status restored to %)', before_status;
  else
    raise exception 'FAIL 8 privileged status update had no effect';
  end if;
end $$;

-- 9. Storage: a signed-in user has no policy that reaches another user's folder.
select policyname, cmd, qual
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;
-- Expect: documents_bucket_select / _insert / _delete only, each limited to the user's own folder
-- ((storage.foldername(name))[1] = auth.uid()::text). Anything else is worth reading.
