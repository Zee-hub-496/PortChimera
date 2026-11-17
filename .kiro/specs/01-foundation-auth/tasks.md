# Spec 01 tasks

Legend: `[x]` built and verified, `[-]` files written but not yet run, `[ ]` not started.

- [x] 1. Create monorepo layout, `.gitignore`, `.env.example`, secret scanner (R1.1, R1.3)
  - Verified: scanner exits 1 on a planted Google-style key and 0 on a clean tree.
- [-] 2. Install dependencies and confirm `npm test` and `npm run lint` pass (R1.2)
  - Verified on the author's Windows machine (Node 24): `npm install` ok, `npm test` 17 of 17 pass, API and web dev servers start.
  - Still open: `npm run lint` not yet run; `npm audit` reported 1 high severity vulnerability that has not been reviewed.
- [-] 3. Environment validation (R2): `loadEnv` tests pass (4); the production-required rule (SUPABASE_URL, SUPABASE_ANON_KEY, CORS_ORIGIN) is written with `envProduction.test.js` but that test has not been run (needs Zod installed)
- [-] 4. Supabase clients: `createAnonClient`, `createUserClient` (R4). Written, not run against a real project. `createAdminClient` is deliberately not built: the service-role key is not needed yet
- [x] 5. `requireAuth` middleware and `supabaseVerifier` + tests with fakes (R3.2 to R3.4)
  - Verified with fakes only; five deliberate breakages each made a test fail. Assumption not yet checked against real Supabase: status 400/401/403 means bad token, 5xx or network failure means 503.
- [-] 6. `GET /api/auth/me` route + test (R3.5)
  - Handler verified with fakes. Route wiring in `app.js` and `authRoutes.test.js` written, not run (needs Express installed).
- [x] 7. Audit helper + test (R6). Verified with fakes.
- [ ] 8. Run migration `0001` on a real Supabase project; two-user RLS check; update `docs/DATABASE.md` (R4)
  - Follow `docs/SETUP_SUPABASE.md`. Only the author can mark this done.
- [ ] 9. Web: Supabase client, auth context, Login page, protected route, API client attaches token (R3.1, R7)
- [ ] 10. Deploy API to Render and web to Vercel; set env vars; confirm health on the deployed site (R8)
- [ ] 11. Update README and `docs/KIRO_USAGE.md`
