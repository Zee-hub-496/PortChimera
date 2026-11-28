# PortChimera

Customs document checking and crisis-aware sea routing, built with Kiro for **Kiroween 2026 (Frankenstein category)**. Started on 2026-11-17.

A shipment needs an invoice, a packing list and a certificate of origin, and these often disagree with each other. PortChimera reads the three documents, lets a person approve what was read, finds the differences between them, and plans the sea route for the shipment, including a re-route when a port or lane is closed.

The "chimera" is three kinds of technology joined into one system:

1. **AI (Gemini)** reads the documents. Its output is a suggestion, shown with the quoted evidence, and a person approves it.
2. **Deterministic code** compares the approved values and decides what is a possible inconsistency. The same inputs always give the same result.
3. **A\* search** picks the fastest, cheapest or lowest-risk route over a graph of ports and lanes, and plans again when a port or lane is closed.

## Try it

- **Deployed app:** https://port-chimera.vercel.app (web, on Vercel) with the API at https://portchimera.onrender.com (Render free tier). The API sleeps when idle, so the first request after a pause can take about a minute. The web app starts waking it when a page opens, and an uptime monitor pings it every 5 minutes during judging. If something looks slow, wait a minute or open https://portchimera.onrender.com/api/health.
- **Run it yourself:** see "Run it". The demo documents are in `fixtures/documents/` (`demo-invoice.pdf`, `demo-packing-list.pdf`, `demo-certificate-of-origin.pdf`). They agree on everything except gross weight: 500 kg on the invoice, 650 kg on the packing list. The cross-check reports that one difference.

## What works

Verified by the author with a real Supabase project, real Gemini and a browser on a local run, using `docs/E2E_CHECKLIST.md` (the author reported the whole app checklist passed; the individual results were not written down). Tests also run in GitHub Actions on every pull request.

| Area                     | What it does                                                                                                                                                                                                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounts and shipments   | Supabase sign-in. Each user sees only their own shipments (Row Level Security plus checks in the API).                                                                                                                                                                                                           |
| Documents and AI reading | Upload PDF, JPEG or PNG (type checked by content, 5 MB). Gemini extracts fields. Every value shows its evidence quote. Values the quote does not support are flagged. A person edits and approves.                                                                                                               |
| Cross-check              | Compares weights, values, parties, goods, dates and countries across the approved documents. Handles country aliases, `1.234` vs `1,234`, split product lines, and invoice freight and tax. Findings are accepted, resolved or dismissed by a person. A warning shows when approvals changed after the last run. |
| Shipment status          | Derived from the documents and findings (Submitted, AI processing, Requires review, AI pre-cleared). "AI pre-cleared" is an internal label, not a customs decision.                                                                                                                                              |
| Routing and crisis       | A\* over 20 seeded ports and 60 lanes. Close a port or lane on the route page and see the re-routed path with time, cost and risk before and after. Scenarios are per user.                                                                                                                                      |
| Alerts, Documents, Map   | Lists across all shipments with search, filters and pagination. A global map of ports and chokepoints.                                                                                                                                                                                                           |
| Audit log                | Each state-changing action writes an entry that the user cannot edit or delete.                                                                                                                                                                                                                                  |

## Known gaps

Read these before trusting the project with anything real.

- **Database hardening is not applied yet.** Migration `0004_protect_shipment_status.sql` and the service-role key setup are written and merged but have not been run on the author's Supabase project. Until then a signed-in user can change their own shipment's `status` by calling the Supabase REST API directly. Even after it, the same user can still edit their own document and finding status through REST, because the API writes those as the signed-in user. Steps and a decision: `docs/DAY6_SECURITY_TEST.md`, `docs/DAILY_PROGRESS.md`.
- **No customs, HS-code or duty module.** It is specified in `.kiro/specs/03-customs-classification` and was left out of scope.
- **AI reads can be wrong.** For example Gemini misread net weights on the demo invoice once; the review step exists for this. A unit change by the AI (0.45 tonnes written as 450 kg) is flagged as unsupported on purpose.
- Document delete exists in the API only (`DELETE /api/documents/:id`), with no button in the web app. Replacing a document is not built.
- A console error from Leaflet (`reading 'save'`) appeared in some sessions. It has no visible effect and is not explained.
- Accessibility and bundle size work was not measured (no Lighthouse score recorded).

## Limitations that will stay true

- Port and lane data is **illustrative**, not live or quoted. Costs and risk scores are made up.
- Results are possible inconsistencies that need manual verification. They are not legal or customs advice.
- Demo documents are synthetic. Do not upload real customer documents: uploaded documents are sent to Google's Gemini API for reading.

## Run it

Requires Node 22 or newer, a Supabase project and a Google AI Studio key.

```bash
npm ci
cp .env.example apps/api/.env      # fill in the API section
cp .env.example apps/web/.env      # keep the VITE_ lines only
```

1. In Supabase, run the files in `supabase/migrations/` in order (`0001` to `0003`). Setup notes: `docs/SETUP_SUPABASE.md`. To also apply `0004`, follow `docs/DAY6_SECURITY_TEST.md` (it needs `SUPABASE_SERVICE_ROLE_KEY` in `apps/api/.env` first).
2. Set `GEMINI_API_KEY` and `GEMINI_MODEL` in `apps/api/.env`. Model names get retired; use one from your AI Studio page.
3. Start both servers in two terminals:

```bash
npm run dev:api     # http://localhost:4000
npm run dev:web     # http://localhost:5173
```

Other commands: `npm test`, `npm run lint`, `npm run format:check`, `npm run scan:secrets`. Never commit `.env` files; keys belong in untracked `.env` files and in host dashboards.

## Repository layout

```
apps/web         React, Vite, Tailwind, Leaflet
apps/api         Express API (zod validation, Supabase client, Gemini REST provider)
packages/core    Framework-free logic: routing, disruption overlay, cross-check, status
supabase/        SQL migrations, seed data, security check script
fixtures/        Synthetic documents only
docs/            Setup, deployment, API notes, security test, E2E checklist, Kiro usage
.kiro/           Specs and steering files used to build this with Kiro
```

## How Kiro was used

- **Specs** in `.kiro/specs/` (requirements, design, tasks) for each area, with task lists kept in step with what was built.
- **Steering** in `.kiro/steering/`: product rules (no accusations, AI is a suggestion, illustrative data is labelled), security, API, database and testing conventions.
- **A day-by-day plan and a progress log** (`docs/PORTCHIMERA_EXECUTION_PLAYBOOK.md`, `docs/DAILY_PROGRESS.md`) that carried context between sessions and record what was not verified.
- Details and examples, including what Kiro could not run: `docs/KIRO_USAGE.md`.

## License

MIT. See `LICENSE`.
