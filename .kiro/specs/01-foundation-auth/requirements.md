# Spec 01: Project foundation and authentication

## Goal
A running, deployable skeleton where a user can sign up, sign in, and call a protected API that can only
return that user's own data. Everything later builds on this.

## Requirements

### R1. Monorepo and tooling
1. THE repository SHALL be an npm-workspaces monorepo with `apps/web`, `apps/api`, `packages/core`.
2. WHEN `npm test` runs THEN all tests in `packages/core` and `apps/api` SHALL execute with Node's built-in runner.
3. THE repository SHALL NOT track any file containing credentials; `npm run scan:secrets` SHALL fail on a planted key.

### R2. Configuration
1. WHEN the API starts THEN it SHALL validate environment variables and exit with a clear message naming invalid variables (never their values).
2. WHEN `NODE_ENV=production` THEN `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `CORS_ORIGIN` SHALL be required.

### R3. Authentication
1. THE web app SHALL sign users up and in through Supabase Auth; the API SHALL NOT expose its own register or login endpoints.
2. WHEN a request to any `/api` route other than `/api/health` has no `Authorization: Bearer` token THEN the API SHALL return 401 with code `UNAUTHENTICATED`.
3. WHEN the token is invalid or expired THEN the API SHALL return 401.
4. WHEN a token is valid THEN the API SHALL attach the user id to the request.
5. WHEN `GET /api/auth/me` is called with a valid token THEN it SHALL return the user's id, email and display name.

### R4. Data access respects RLS
1. THE API SHALL query Supabase using a client created from the caller's JWT so RLS applies.
2. THE service-role key SHALL NOT be used for reading or writing user-owned rows.

### R5. Consistent responses
1. THE API SHALL return `{ data }` on success and `{ error: { code, message } }` on failure.
2. WHEN an unexpected error occurs THEN the response SHALL NOT include stack traces, SQL or file paths.

### R6. Audit helper
1. THE API SHALL provide one function to write an audit entry (`user_id`, `shipment_id?`, `action`, `details`).
2. Audit entries SHALL be insert-only.

### R7. Web shell
1. THE web app SHALL have routes for Landing, Login, and a protected area (Dashboard) with navigation.
2. WHEN an unauthenticated user opens a protected route THEN they SHALL be redirected to Login.
3. THE web app SHALL call the API only through `lib/api.js`, which attaches the access token.

### R8. Deployment skeleton
1. THE API SHALL be deployed to Render and the web app to Vercel with environment variables set in the host dashboards.
2. WHEN the deployed web app loads THEN it SHALL show the API health status.
