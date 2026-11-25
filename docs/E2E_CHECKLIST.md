# End-to-end release checklist

Fill in Pass or Fail and the date for every step. Use a brand-new account and the synthetic demo PDFs in `fixtures/documents/`. Nothing here is marked passed until a person ran it.

Run it twice: once locally (`npm run dev:api`, `npm run dev:web`), and once on the deployed app when the API is deployed (see "Pending" in `docs/DAILY_PROGRESS.md`). Wake a free-tier API first (open `/api/health`), because cold starts can take a minute.

Environment: `[ ] local` `[ ] deployed` URL: ____________ Date: ________ Commit: ________

| #   | Step                                                                             | Expected                                                                 | Result | Notes |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------ | ----- |
| 1   | Open the landing page logged out                                                 | Page loads, no "coming soon" labels, no console errors                   |        |       |
| 2   | Register a new account and sign in                                               | Lands on the dashboard, empty state shown                                |        |       |
| 3   | Create shipment `DEMO-001`, CNSHA to PKKHI                                       | Appears in the list with status Submitted                                |        |       |
| 4   | Upload the three demo PDFs                                                       | Each shows "Uploaded, not read yet"                                      |        |       |
| 5   | Process each document with AI                                                    | "AI is reading" then "Ready for your review"; status AI processing       |        |       |
| 6   | Review each document, fix any wrong value, approve                               | "Reviewed and approved"; evidence quotes shown                           |        |       |
| 7   | Run the cross-check                                                              | One High finding: gross weight 500 kg vs 650 kg                          |        |       |
| 8   | Open Alerts                                                                      | The finding is listed; search and severity filter work                   |        |       |
| 9   | Decide on the finding (Resolve)                                                  | Shipment status becomes AI pre-cleared; dashboard counts match           |        |       |
| 10  | Open the Documents page                                                          | Three documents listed; status filter works                              |        |       |
| 11  | Open the shipment Route tab                                                      | Route, time, cost and risk shown                                         |        |       |
| 12  | Close a port or lane in "What if?"                                               | Rerouted path with before and after numbers, or a clear "no alternative" |        |       |
| 13  | Reset to the original route                                                      | Original route back                                                      |        |       |
| 14  | Re-approve a document after the cross-check                                      | Cross-check page shows the "may be out of date" warning                  |        |       |
| 15  | Phone width (390 px): dashboard, shipments, a shipment, route, alerts, documents | No horizontal scroll, buttons usable                                     |        |       |
| 16  | Sign out, open a shipment URL                                                    | Redirected to login                                                      |        |       |

## Two-user security (needs two accounts)

Details and commands: `docs/DAY6_SECURITY_TEST.md`.

| #   | Step                                                       | Expected                       | Result | Notes |
| --- | ---------------------------------------------------------- | ------------------------------ | ------ | ----- |
| S1  | Migration 0004 applied and `SUPABASE_SERVICE_ROLE_KEY` set | Status still updates in step 9 |        |       |
| S2  | SQL checks `day6_security_checks.sql`                      | PASS 0 to PASS 8               |        |       |
| S3  | Alice PATCHes `status` over REST                           | HTTP 403                       |        |       |
| S4  | Bob reads, edits, deletes Alice's shipment over REST       | Empty results, nothing changed |        |       |
| S5  | Bob reads Alice's document file over Storage               | Not found                      |        |       |
| S6  | Bob calls `DELETE /api/documents/<Alice's id>`             | 404                            |        |       |

## Result

Blocking failures (P0 or P1): ____________________

Link to the PR or tag for this run: ____________________
