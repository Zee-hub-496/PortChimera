# Set up Supabase for PortChimera

This guide connects the API to your Supabase project and checks that login protection works. It assumes Windows, PowerShell, the repo at `D:\KIRO\PortChimera`, and Node 24.

Your project URL is `https://pvtrojdzqrbbxsbccyvm.supabase.co`. The URL is not a secret.

## What is verified and what is not

- Verified with fake Supabase clients (no real network): the token-checking middleware, the token verifier's error handling, the `/api/auth/me` handler and the audit helper.
- Written but **never run**: the production environment rule, the Supabase client helpers, the Express route wiring, and the SQL migration. This guide is how you run them for the first time.
- One assumption to confirm: the verifier treats Supabase errors with status 400, 401 or 403 as "bad token", and 5xx or network failures as "service problem" (HTTP 503). That comes from how supabase-js is documented to behave and has not been checked against a real project.

If a step below behaves differently from what is described, send the error text only (never keys or tokens) so the code or the guide can be fixed.

## Keys: what is safe and what is not

| Key                                                         | Where it may go                                                                    |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Project URL                                                 | API and web `.env`                                                                 |
| Publishable key (`sb_publishable_...`) or legacy `anon` key | API and web `.env`. It is designed to be public; Row Level Security protects data. |
| Secret key (`sb_secret_...`) or legacy `service_role` key   | **Nowhere yet.** Not needed. Never in the web app, Git or chat.                    |
| Database password                                           | **Nowhere.** Never in the web app, Git or chat.                                    |

Never paste keys, access tokens or the database password into chat.

## 1. Copy the public key

1. Open your project in the Supabase dashboard.
2. On the project home page, click the **API Keys** tile ("Manage project keys"). Alternatively use **Project Settings** (gear icon, bottom of the left bar), then **API Keys**.
3. Copy the **publishable** key (starts with `sb_publishable_`). If you only see a **Legacy API Keys** tab, copy the **anon** key (a long string starting `eyJ`).
4. Do not copy the secret or `service_role` key.

## 2. Create the two `.env` files

Both files are ignored by Git. The API reads `apps/api/.env`. The web app reads `apps/web/.env`.

In PowerShell:

```powershell
cd D:\KIRO\PortChimera
New-Item apps\api\.env -ItemType File -Force
New-Item apps\web\.env -ItemType File -Force
notepad apps\api\.env
```

Paste this into `apps/api/.env`, replace the placeholder, and save:

```
NODE_ENV=development
PORT=4000
CORS_ORIGIN=http://localhost:5173
SUPABASE_URL=https://pvtrojdzqrbbxsbccyvm.supabase.co
SUPABASE_ANON_KEY=PASTE_PUBLISHABLE_OR_ANON_KEY_HERE
```

Then `notepad apps\web\.env` and paste:

```
VITE_API_URL=http://localhost:4000
VITE_SUPABASE_URL=https://pvtrojdzqrbbxsbccyvm.supabase.co
VITE_SUPABASE_ANON_KEY=PASTE_PUBLISHABLE_OR_ANON_KEY_HERE
```

Notepad may offer to add `.txt` when saving; the file name must stay exactly `.env`. You can also create these files in the Kiro IDE. Check with `git status`: neither file should appear.

## 3. Run the migration and seed

1. In the dashboard open **SQL Editor**, then **New query**.
2. Open `supabase/migrations/0001_initial_schema.sql` in Kiro, select all, copy, paste into the editor, click **Run**. Expect "Success. No rows returned".
3. Click **New query** again. Do the same with `supabase/seed/routing_seed.sql`.
4. Check the data. New query, paste, Run:

```sql
select
  (select count(*) from public.ports)          as ports,
  (select count(*) from public.shipping_edges) as shipping_edges;
```

Expected: `ports = 20`, `shipping_edges = 60`.

5. Check that row security is on for every table:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

Expected: `rowsecurity` is `true` for every row.

If any step shows an error, copy the error text only and send it. Do not run the migration a second time after a partial failure without asking, because the tables may already exist.

## 4. Create two test users

1. **Authentication**, then **Users**, then **Add user**, then **Create new user**.
2. Enter a made-up email such as `alice@example.com` and a password you will remember. Turn on **Auto Confirm User**. No email is sent. Click **Create user**.
3. Repeat with `bob@example.com`.
4. Check that profiles were created by the trigger. In the SQL Editor:

```sql
select id, display_name from public.profiles;
```

Expected: two rows, with display names `alice` and `bob`.

## 5. Check login protection from PowerShell

Start the API in one PowerShell window:

```powershell
cd D:\KIRO\PortChimera
npm install
npm run dev:api
```

The "Supabase is not configured" warning should **not** appear. If it does, see Troubleshooting.

Open a second PowerShell window.

No token should be refused (expect a 401):

```powershell
try { Invoke-RestMethod http://localhost:4000/api/auth/me } catch { $_.Exception.Response.StatusCode.value__ }
```

Get a real token for alice. Replace the key and password; the token stays in a variable and is never printed:

```powershell
$url = "https://pvtrojdzqrbbxsbccyvm.supabase.co"
$key = "PASTE_PUBLISHABLE_OR_ANON_KEY_HERE"
$body = @{ email = "alice@example.com"; password = "YOUR_PASSWORD" } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri "$url/auth/v1/token?grant_type=password" -Headers @{ apikey = $key } -ContentType "application/json" -Body $body
$aliceToken = $login.access_token
```

Call the API with it:

```powershell
(Invoke-RestMethod -Uri http://localhost:4000/api/auth/me -Headers @{ Authorization = "Bearer $aliceToken" }).data
```

Expected: alice's own `id`, `email` and `displayName` (`alice`). Repeat with bob's email and password into `$bobToken` and confirm you get bob's details, not alice's.

Do not paste tokens into chat.

## 6. Run the tests and commit the lock file

```powershell
npm test
git status
```

`npm install` added `@supabase/supabase-js` and changed `package-lock.json`. Commit that file:

```powershell
git add package-lock.json
git commit -m "chore: update lockfile for supabase-js"
```

Expected: `npm test` passes. The route and production-env tests (`authRoutes.test.js`, `envProduction.test.js`) have never run before, so a failure there is useful information. Send the failure text.

## Troubleshooting

| Symptom                                         | Likely cause and fix                                                                                                                                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Warning "Supabase is not configured" at startup | The API did not find `SUPABASE_URL` and `SUPABASE_ANON_KEY`. The file must be `apps\api\.env` (not the repo root), with no `.txt` suffix. Restart the API after editing.                       |
| 401 even with a fresh token                     | The token came from a different project, or the `apikey` used to log in differs from `SUPABASE_ANON_KEY`. Check the URL matches your project. Tokens expire after about an hour; log in again. |
| 503 from `/api/auth/me`                         | The API could not reach Supabase, or Supabase returned a server error. Check your internet, the URL spelling and the Supabase status page.                                                     |
| Login call returns `invalid_credentials`        | Wrong password, or the user was created without **Auto Confirm User**. Delete and recreate the user.                                                                                           |
| `/api/auth/me` returns `displayName: null`      | The profile row is missing. Re-check step 4. The trigger only fires for users created after the migration ran.                                                                                 |
| `relation ... already exists` during migration  | The migration was partly applied. Send the error text before retrying.                                                                                                                         |
| `npm install` fails                             | Send the error text. Check Node with `node --version` (24 expected).                                                                                                                           |
