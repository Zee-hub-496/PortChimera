# Day 6 security test (run on your machine)

Needs two accounts you control (call them Alice and Bob) and an Alice shipment with at least one uploaded document. Do not paste tokens or keys into chat, commits or screenshots.

## 1. Apply the migration

1. Supabase, SQL Editor, new query. Paste `supabase/migrations/0004_protect_shipment_status.sql`, Run.
2. In Render (or your local `apps/api/.env`) set `SUPABASE_SERVICE_ROLE_KEY` (Project Settings, API, `service_role`). Restart the API.
   Order matters: with the migration applied and no key set, the status stops updating (the API logs `shipment_status_sync_failed`).

## 2. Database checks

Open `supabase/checks/day6_security_checks.sql`, replace `ALICE_EMAIL` and `BOB_EMAIL`, run it in the SQL Editor. Expect lines `PASS 0` to `PASS 8`, and a policy list for check 9. Copy the Messages output to the session (it holds no secrets).

## 3. REST checks with two real sessions

Sign in as Alice in the web app. In the browser console:

```js
const k = Object.keys(localStorage).find((x) => x.includes('auth-token'));
JSON.parse(localStorage.getItem(k)).access_token;
```

Do the same in a private window for Bob. In PowerShell (replace the placeholders; keep tokens in variables, not in files):

```powershell
$url = 'https://<project>.supabase.co'; $anon = '<anon key>'
$alice = '<alice token>'; $bob = '<bob token>'; $ship = '<alice shipment id>'
function Rest($tok, $method, $path, $body) {
  $h = @{ apikey = $anon; Authorization = "Bearer $tok"; 'Content-Type' = 'application/json'; Prefer = 'return=representation' }
  try { Invoke-RestMethod -Method $method -Uri "$url/rest/v1/$path" -Headers $h -Body $body } catch { "HTTP $($_.Exception.Response.StatusCode.value__)" }
}
```

| #   | Command                                                                   | Expected                     |
| --- | ------------------------------------------------------------------------- | ---------------------------- |
| 1   | `Rest $alice PATCH "shipments?id=eq.$ship" '{"status":"ai_pre_cleared"}'` | `HTTP 403` (error 42501)     |
| 2   | `Rest $bob GET "shipments?id=eq.$ship"`                                   | empty list                   |
| 3   | `Rest $bob PATCH "shipments?id=eq.$ship" '{"shipment_number":"X"}'`       | empty list (nothing changed) |
| 4   | `Rest $bob DELETE "shipments?id=eq.$ship"`                                | empty list (nothing deleted) |
| 5   | `Rest $bob GET "documents?shipment_id=eq.$ship"`                          | empty list                   |
| 6   | `Rest $bob GET "discrepancies?shipment_id=eq.$ship"`                      | empty list                   |

Storage (Bob tries Alice's file; use a real `storage_path` from the `documents` table):

```powershell
Invoke-WebRequest -Headers @{ apikey = $anon; Authorization = "Bearer $bob" } -Uri "$url/storage/v1/object/documents/<alice storage_path>"
```

Expected: HTTP 400 or 404 (object not found for Bob). The same with `$alice` returns the file.

## 4. App checks (Alice)

1. Normal flow still works: upload three documents, process, approve, run the cross-check, decide on findings. The shipment status moves as on Day 1.
2. Delete one document (API: `DELETE /api/documents/<id>` with Alice's token). Then check in Supabase: no row in `documents`, `document_extractions` and `line_items` for it, and Storage, bucket `documents`, has no object at its old path. The shipment falls back to `submitted` and its cross-check shows as not run.
3. Bob calling `DELETE /api/documents/<alice document id>` returns 404 and Alice's document is still there.

## What is not covered yet

See "Open decision" in `docs/DAILY_PROGRESS.md` (Day 6): the other tables are still writable by their owner through REST.
