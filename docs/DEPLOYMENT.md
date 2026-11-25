# Deployment (Vercel web + Render API)

Secrets go in the Vercel, Render and Supabase dashboards only. Never put them in Git or in chat.

## Order

1. Deploy the API on Render (you need its URL for the web build).
2. Deploy the web app on Vercel (you need its URL for CORS).
3. Set the API `CORS_ORIGIN` to the Vercel URL and redeploy the API.
4. Add both URLs to Supabase Auth settings.
5. Run the smoke test.

## 0. Database migration (before the API goes live)

Run `supabase/migrations/0003_documents_processing_started_at.sql` in Supabase > SQL Editor. It adds one nullable column and is safe to run twice. The API writes this column when a document starts processing, so deploy the API only after this has run.

## 1. Render (API)

1. Render dashboard > **New** > **Blueprint** > pick the `PortChimera` repo. Render reads `render.yaml` at the repo root.
   (Manual alternative: **New** > **Web Service**, build command `npm ci`, start command `npm run start -w @portchimera/api`, health check path `/api/health`, env var `NODE_VERSION=22`.)
2. When prompted for the variables marked `sync: false`, enter:
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY` (Supabase > Project Settings > API).
   - `GEMINI_API_KEY` and `GEMINI_MODEL` (use `gemini-3.5-flash-lite`).
   - `CORS_ORIGIN`: put a placeholder such as `http://localhost:5173` now, change it in step 3.
3. Set `SUPABASE_SERVICE_ROLE_KEY` (Supabase, Project Settings, API, `service_role`). The API refuses to start in production without it, because shipment status is written with it (migration 0004). Server only: never in Vercel, never in a `VITE_` variable.
4. Deploy. The API refuses to start in production if `SUPABASE_URL`, `SUPABASE_ANON_KEY` or `CORS_ORIGIN` is missing; the deploy log names the variable.
5. Note the service URL, for example `https://portchimera-api.onrender.com`.

Free instances sleep after inactivity, and the first request can take about a minute.

## 2. Vercel (web)

1. Vercel dashboard > **Add New** > **Project** > import `PortChimera`.
2. Set **Root Directory** to `apps/web`. Leave the framework as Vite. `apps/web/vercel.json` adds the SPA rewrite so a refresh on `/shipments` does not 404.
3. Environment Variables (Production and Preview):
   - `VITE_API_URL` = the Render URL (no trailing slash).
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
     These are public by design; the anon key is protected by Row Level Security.
4. Deploy and note the URL, for example `https://portchimera.vercel.app`.

Note: Vercel runs `npm install` at the workspace root when the root directory is `apps/web`, which resolves `@portchimera/core`. If the build cannot find that package, enable **Include source files outside of the Root Directory** in Project Settings > General.

## 3. CORS

Render > `portchimera-api` > **Environment** > set `CORS_ORIGIN` to the exact Vercel origin (scheme and host, no path, no trailing slash). Save; Render redeploys.

CORS accepts a single origin. Vercel preview URLs will be blocked; use the production URL for the demo.

## 4. Supabase Auth

Supabase > Authentication > URL Configuration: set **Site URL** to the Vercel URL and add it under **Redirect URLs**.

## 5. Smoke test

```
node scripts/smoke-test.mjs https://<api>.onrender.com https://<app>.vercel.app
```

Expect five PASS lines. It needs no secrets.

## Client IP and rate limits

The API sets `trust proxy` to `TRUST_PROXY_HOPS` (default 1). Render puts its proxy in front of the service, so one hop is assumed. This is not confirmed against Render's documentation (the docs site could not be fetched on Day 2). To verify after deploy, call `/api/health` 130 times from your machine, then from a phone on mobile data. Only the first client should get 429. If both are limited, or one client can dodge the limit by sending its own `X-Forwarded-For`, change `TRUST_PROXY_HOPS` in Render (try 2, since Render may sit behind Cloudflare).
