# Spec 01 tasks

Legend: `[x]` built and verified, `[-]` files written but not yet run, `[ ]` not started.

- [x] 1. Create monorepo layout, `.gitignore`, `.env.example`, secret scanner (R1.1, R1.3)
  - Verified: scanner exits 1 on a planted Google-style key and 0 on a clean tree.
- [-] 2. Install dependencies and confirm `npm test` and `npm run lint` pass (R1.2)
  - Verified on the author's Windows machine (Node 24): `npm install` ok, `npm test` 17 of 17 pass, API and web dev servers start.
  - Still open: `npm run lint` not yet run; `npm audit` reported 1 high severity vulnerability that has not been reviewed.
- [-] 3. Environment validation (R2): written and tested (4 `loadEnv` tests pass); the production-required rule is still to add
- [ ] 4. Supabase clients: `createUserClient`, `createAdminClient` (R4)
- [ ] 5. `requireAuth` middleware + tests with a fake validator (R3.2 to R3.4)
- [ ] 6. `GET /api/auth/me` route + test (R3.5)
- [ ] 7. Audit helper + test (R6)
- [ ] 8. Run migration `0001` on a real Supabase project; two-user RLS check; update `docs/DATABASE.md` (R4)
- [ ] 9. Web: Supabase client, auth context, Login page, protected route, API client attaches token (R3.1, R7)
- [ ] 10. Deploy API to Render and web to Vercel; set env vars; confirm health on the deployed site (R8)
- [ ] 11. Update README and `docs/KIRO_USAGE.md`
