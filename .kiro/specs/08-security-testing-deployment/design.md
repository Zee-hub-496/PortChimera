# Spec 08 design

## Test layers

| Layer | Tool | Needs network/DB? | Runs in CI |
|---|---|---|---|
| Core logic (A*, cross-check, duty, status) | `node:test` | No | Yes |
| API with fake AI provider and fake auth validator | `node:test` + fetch to an ephemeral port | No | Yes |
| RLS and storage policies | Manual two-user check, then a script against a test Supabase project | Yes | Optional, manual |
| End-to-end demo story | Manual checklist in `docs/DEMO.md`, later maybe Playwright | Yes | No |

Only the bottom two layers touch real services, and they use synthetic data. Automated tests never call Gemini.

## Authorization test helper

One helper builds the app with an injected fake token validator that maps `token-alice` and `token-bob` to user ids, and an in-memory
repository. A table-driven test loops over every shipment-scoped route and asserts the four outcomes in R1.1. Adding a route without
adding it to the table fails a "route coverage" test that lists registered routes.

## CI (`.github/workflows/ci.yml`)

Steps: checkout, setup Node 22, `npm ci`, `npm run lint`, `npm run format:check`, `npm test`, `npm run scan:secrets`.
Secrets are not needed because tests do not call real services.

## Deployment notes (verify each at deploy time)

- Render web service: build `npm ci`, start `npm run start -w @portchimera/api`, env vars from `.env.example`.
- Vercel: root `apps/web`, build `npm run build`, output `dist`, set `VITE_*` variables, and a rewrite so React Router deep links work.
- Free tiers may sleep or pause; check the current behaviour on each provider's pricing page and plan a warm-up step.
- Supabase: set the Site URL and redirect URLs to the Vercel domain; decide on email confirmation for demo accounts.

## Bundle secret check

After `vite build`, grep `apps/web/dist` for `SERVICE_ROLE`, `GEMINI`, `AIza`. Any hit fails the build step in CI.

## Submission checklist

Public repo and license (only after reading the official rules), demo video, write-up of Kiro usage, screenshots, deployed URL,
test accounts with synthetic data, and the honest limitations section.
