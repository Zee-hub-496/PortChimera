# Design: protecting `shipments.status` in the database

Status: **Option A approved by the owner on 2026-11-23. Implemented on Day 6 (migration `0004_protect_shipment_status.sql`), pending the owner's real-database checks.**
Written on Day 1 (2026-11-22 session).

## The problem

Policy `shipments_owner_update` (migration 0001) lets a signed-in user update **any column** of their own shipment. Anyone with their own login token can call the Supabase REST API directly and run:

```
PATCH /rest/v1/shipments?id=eq.<their shipment>   body: {"status": "ai_pre_cleared"}
```

That skips the API, the cross-check and every rule. Since Day 1, the API derives `status` from documents and discrepancies (`deriveShipmentStatus` in `packages/core`), but the database does not enforce that only this code may set it.

## The constraint that shapes every option

The API talks to the database **as the signed-in user** (their JWT, role `authenticated`), so Row Level Security applies. A direct REST call from the browser uses the same role. At the database, an API write and a forged write look the same. So "block status changes unless it is the server" is only possible if the server uses a different identity for that one write.

## Options

| #   | Option                                                                                                                                                                                         | Blocks forged REST `PATCH status`?                                         | Needs service-role key in API?      | Extra work                                                                                                                     | Main risk                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| A   | Trigger on `shipments` that rejects status changes unless `auth.role() = 'service_role'`; API writes status through a second, server-only client                                               | Yes                                                                        | **Yes** (for the status write only) | Small trigger, one extra client, tests                                                                                         | A leaked service-role key bypasses all RLS. Must live only in Render env, never in web or logs |
| B   | Revoke column `UPDATE` on `status` from `authenticated`, grant update on the other columns                                                                                                     | Yes, but the API cannot write status either                                | Yes (same as A)                     | Per-column grants must be kept in step with every new column                                                                   | Easy to break when a column is added                                                           |
| C   | `SECURITY DEFINER` function `set_shipment_status(id, status)` plus revoking column update                                                                                                      | **No.** The user can call the function over REST (RPC) and pass any status | No                                  | -                                                                                                                              | Moves the hole, does not close it                                                              |
| D   | Compute status in SQL: a function `derive_shipment_status(id)` and a `BEFORE UPDATE` trigger that always overwrites `NEW.status` with it; refresh after changes to documents and discrepancies | Yes: whatever the user sends is overwritten                                | **No**                              | Same rules written twice (JS and SQL). Needs SQL tests against a real database. Staleness rule needs `cross_checked_at` in SQL | Two copies of the rules can drift                                                              |

## What none of these fix alone

A user can also edit `documents.processing_status` and `discrepancies.review_status` directly (their policies are `for all`). With options A, B or D, a user could set a document to `reviewed` and a finding to `resolved` through REST and the derived status would then honestly say `ai_pre_cleared`. Closing that is the rest of Day 6 (tighter policies on `documents`, `document_extractions`, `discrepancies`, insert-only `audit_logs`). Protecting `status` alone is necessary but not enough.

## Recommendation

**Option A**, because it is the smallest change, keeps one copy of the rules (JavaScript in `packages/core`, which is unit-tested), and is easy to roll back.

Plan:

1. Migration `0003_protect_shipment_status.sql` (additive): a trigger function that raises an error when `NEW.status` differs from `OLD.status` and the caller is not `service_role`. Insert is allowed only with the default `submitted`.
2. API: one extra Supabase client created from `SUPABASE_SERVICE_ROLE_KEY`, used only inside `syncShipmentStatus` (`apps/api/src/modules/shipments/statusSync.js`) for the single `update({ status })` call. Ownership is still checked first with the user-scoped client, so the service key never reads or writes anything the user could not.
3. Tests: (a) normal flow still changes status (no regression), (b) a user-scoped client trying to update `status` is rejected, (c) Bob cannot change Alice's status, (d) the service client is not used for any other table.
4. Rollback: `drop trigger` and `drop function`. Nothing else changes.

**This changes a rule in the playbook** ("the service-role key is not used for user data"). The write is narrow, but it is an exception, so the owner must approve it. If the owner prefers to keep that rule, use **Option D** and accept the duplicated rules and the extra SQL tests.

## Decision needed

- [x] Option A (service-role key used for the status write only). Approved by the owner, 2026-11-23
- [ ] Option D (rules in SQL, no service-role key)
- [ ] Other:
