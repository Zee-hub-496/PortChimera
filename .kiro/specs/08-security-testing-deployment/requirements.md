# Spec 08: Security, testing and deployment

## Goal
Make sure the app is safe, proven by tests, deployed, and ready to demo and submit. This spec runs alongside the
others (its rules apply from day one) and has a dedicated pass at the end.

## Requirements

### R1. Authorization matrix
1. FOR every shipment-scoped endpoint, a test SHALL prove: no token -> 401, invalid token -> 401, other user's resource -> 404, owner -> success.
2. RLS SHALL be verified with two real users: user B reads zero of user A's rows in every user-owned table.

### R2. Input and upload safety
1. EVERY endpoint SHALL validate input with zod and reject unknown or malformed fields.
2. Uploads SHALL be tested with: wrong type, wrong magic bytes, oversized file, zero bytes, path-like filename.

### R3. Secrets
1. `npm run scan:secrets` SHALL pass on every commit and in CI.
2. No response, log line or test fixture SHALL contain an API key, service-role key or signed URL.
3. The browser bundle SHALL contain only `VITE_`-prefixed values; a build check SHALL grep the bundle for server-only key names.

### R4. Rate limiting and errors
1. THE API SHALL apply a global rate limit and a stricter limit on upload and AI routes.
2. THE API SHALL return the standard error envelope for every failure with no stack traces.

### R5. Continuous integration
1. A GitHub Actions workflow SHALL run install, lint, format check, tests and the secret scan on every push and pull request.

### R6. Deployment
1. THE API SHALL deploy to Render and the web app to Vercel, with environment variables set only in the host dashboards.
2. CORS SHALL allow only the deployed web origin.
3. THE team SHALL record cold-start behaviour of the chosen hosts and warm them before the demo.

### R7. Documentation and submission
1. THE repo SHALL have a README with what it does, architecture, setup, env vars (names only), how to run tests, and honest limitations.
2. `docs/KIRO_USAGE.md` SHALL record how specs, steering, hooks and agents were used, with examples.
3. THE repo SHALL contain `docs/DEMO.md` with the 3-minute script and seeded demo accounts (synthetic data only).
4. BEFORE submission THE author SHALL re-read the official Devpost rules for repository visibility, license, video length and required write-ups.

### R8. Honesty
1. THE README and UI SHALL NOT claim a feature that is not built and tested, and SHALL list known limitations (illustrative graph data, curated tariff subset, internal statuses).
