# Demo script (under 3 minutes)

Use the synthetic PDFs in `fixtures/documents/`: `demo-invoice.pdf`, `demo-packing-list.pdf`, `demo-certificate-of-origin.pdf`. Use a dedicated demo account. Never show a personal password, keys or the Supabase dashboard with keys visible.

Before recording: start the API and web app, sign in once, delete any old `DEMO-001`, and check that `GEMINI_API_KEY` works by reading one document. If the API runs on a free host, open `/api/health` first to wake it.

| Time | Show                                                   | Say                                                                                           |
| ---- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 0:00 | Landing page                                           | One sentence: three documents per shipment often disagree. PortChimera finds the differences. |
| 0:15 | Create shipment `DEMO-001`, CNSHA to PKKHI             | Status is Submitted.                                                                          |
| 0:25 | Upload the three PDFs, press process                   | AI reads them. Gemini is a suggestion, not a decision.                                        |
| 0:45 | Open one document, show a value and its evidence quote | Every value points to text in the document. A person edits and approves.                      |
| 1:05 | Approve all three, run the cross-check                 | Fixed rules, no AI. One High finding: gross weight 500 kg vs 650 kg.                          |
| 1:25 | Alerts page, then resolve the finding                  | Possible inconsistency, needs manual verification. Status becomes AI pre-cleared (internal).  |
| 1:45 | Route tab                                              | A\* picks fastest, cheapest or lowest-risk. Ports and costs are illustrative.                 |
| 2:00 | "What if?": close a port or lane                       | Re-route with before and after time, cost and risk. Show the map.                             |
| 2:35 | Reset route, end on the dashboard                      | Name the three parts: AI reads, code decides, A\* routes.                                     |

Be honest on camera about limits: illustrative port data, no customs or duty module, AI can misread (that is why a person approves).
