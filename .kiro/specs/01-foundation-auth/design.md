# Spec 01 design

## Auth flow

```
Browser (supabase-js)  --signIn-->  Supabase Auth  --access token (JWT)-->  Browser
Browser  --Authorization: Bearer <JWT>-->  Express
Express middleware requireAuth:
    1. read the bearer token (401 if missing)
    2. ask Supabase to validate it: supabase.auth.getUser(token)   (401 if invalid)
    3. req.auth = { userId, email, token }
    4. req.db = createUserClient(token)    <- Supabase client that sends the user's JWT, so RLS applies
```

**Why `getUser(token)` instead of verifying the JWT ourselves?** It makes Supabase the single authority
(handles key rotation and revoked sessions) and avoids us handling the JWT secret. The cost is one network
call per request, which is acceptable at this scale. Revisit only if latency matters.

**Why a per-request user client?** If the API used the service-role key, Postgres would skip RLS and a bug in
our code could expose other users' data. With the user's JWT, the database enforces ownership too.

## Files

- `apps/api/src/config/env.js` (done): zod-validated config. Task 3 tightens it for production.
- `apps/api/src/config/supabase.js`: `createUserClient(token)` and `createAdminClient()` (admin only for signed URLs).
- `apps/api/src/middleware/requireAuth.js`: steps above.
- `apps/api/src/modules/auth/routes.js`: `GET /api/auth/me`.
- `apps/api/src/modules/audit/service.js`: `recordAudit(db, { shipmentId, action, details })`.
- `apps/web/src/lib/supabase.js`, `AuthContext.jsx`, `ProtectedRoute.jsx`, `pages/Login.jsx`, `pages/Dashboard.jsx` (placeholder shell).

## Testing approach

- `requireAuth` takes its Supabase validator as a parameter, so tests pass a fake that accepts one known token. No real network.
- Cases: no header, wrong scheme, empty token, invalid token, valid token, health stays public.
- A manual RLS check with two real Supabase users is done once and recorded in `docs/DATABASE.md`.

## Risks

- Supabase email confirmation can block fast demos. Decide in the dashboard: disable confirmation for the demo project, or use pre-made demo accounts.
- Render's free tier may sleep when idle (verify current behaviour). Warm it before demos.
