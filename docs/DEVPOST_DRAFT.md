# Devpost draft

Copy each section into the Devpost form. Replace the placeholders in [brackets] after you check them. Nothing here claims customs approval, live port data or guaranteed AI accuracy.

## Project name

PortChimera

## Tagline (one line)

AI suggests. Rules verify. Humans approve. A* adapts.

## Category

Frankenstein

## Inspiration

A shipment travels with an invoice, a packing list and a certificate of origin. They are written by different people and often disagree by a weight, a spelling of a country, or a total that leaves out freight. Someone checks them by eye. And when a port closes, the same person has to work out a new route. I wanted to see whether three technologies that rarely meet, an AI reader, strict rules and a search algorithm, could be stitched into one careful workflow.

## What it does

- You create a shipment and upload its three documents (PDF, JPEG or PNG).
- Gemini reads each document and proposes the field values. Every value is shown with the quote it came from. If the quote does not contain the value, the app flags it.
- You correct anything wrong and approve each document. Nothing is trusted until a person approves it.
- A deterministic cross-check compares the approved values: weights, totals, parties, goods, dates, countries. It understands country aliases, `1.234` versus `1,234`, split product lines and freight on the invoice. The demo set has one planted difference: 500 kg on the invoice against 650 kg on the packing list.
- You accept, resolve or dismiss each finding, and the shipment status follows from that. "AI pre-cleared" is an internal label, never a customs decision.
- The route page plans the fastest, cheapest or lowest-risk sea route with A* search. Close a port or a lane and the route is planned again, with the estimated change in time, freight cost and risk, and a note when no alternative exists. All port and cost data is illustrative.

## How I built it

- **Frontend:** React, Vite, Tailwind and Leaflet, with light and dark themes.
- **Backend:** an Express API with zod validation. It talks to the database as the signed-in user, so Postgres Row Level Security applies.
- **Data and auth:** Supabase (Auth, Postgres with RLS, a private Storage bucket).
- **AI:** Gemini through its REST API, with structured output, an evidence check for every value, and a cache keyed by file hash.
- **Core logic:** a framework-free package with A*, the disruption overlay, the cross-check and the status rules. It is tested without any server.
- **Quality:** automated tests, GitHub Actions (secret scan, lint, format check, tests, build), a database trigger that stops users from editing their own shipment status, and an audit log nobody can edit or delete.
- **Hosting:** Vercel for the web app and Render's free tier for the API.

## How I used Kiro

- I wrote eight specs (requirements, design, tasks) in `.kiro/specs` before the code they describe, and nine steering files in `.kiro/steering` that fixed the rules: AI output is a suggestion, wording never accuses anyone, illustrative data is labelled, and the core package stays free of frameworks.
- A day-by-day plan and a progress log carried context from one Kiro session to the next. Each session started by reading the log and ended by writing down what was and was not verified.
- Kiro's sandbox could not install packages or reach Gemini and Supabase, so Kiro wrote code and tests that run with fakes, and I ran the real checks on my machine and in GitHub Actions. The log records which is which.
- Engines were broken on purpose to prove the tests can fail: a heuristic that overestimates made 5 tests fail, and an overlay that left a closed port's lanes in the graph was caught by the tests.
- Kiro found problems in its own specs before building (for example a percentage that contradicted its own formula), and the real run found a bug the sandbox could not see (line endings on Windows). Hooks, custom agents and MCP were not used.
  [Add one sentence about any Kiro IDE use only if it is true.]

## Challenges

- Getting an AI reader I could trust. The fix was to never trust it: every value needs a quote that contains it, and a person approves the result.
- False alarms. The first cross-check flagged country aliases, number formats and freight as differences. Each false alarm became a test before it became a fix.
- Security with a browser-facing database. I verified Row Level Security with two accounts and wrote a database trigger for the shipment status. I also found, and wrote down, what is still open: a user can edit some of their own derived records through the database API.
- Free hosting. The API sleeps when idle, so the web app wakes it as soon as a page opens.

## Accomplishments I am proud of

- The whole workflow works end to end on the live site with synthetic documents.
- The cross-check is deterministic and explainable, and the app shows its evidence.
- The README lists what does not work as clearly as what does.

## What I learned

Treating AI output as a suggestion that has to show its evidence changes the design of everything around it. Passing tests only mean something if you have seen them fail.

## What's next

- Move the remaining owner-editable writes to the server.
- A customs and HS-code suggestion module (specified, not built).
- Document replace and a delete button, a dashboard of crisis impact, and real port data in place of the illustrative set.

## Honest limitations

Port, lane, cost and risk data is illustrative. Results are possible inconsistencies that need manual verification, not legal or customs advice. AI can misread a document, which is why a person approves. The free API can take about a minute to wake up.

## Built with

React, Vite, Tailwind CSS, Leaflet, Express, zod, Supabase, PostgreSQL, Gemini API, A* search, Node.js, GitHub Actions, Vercel, Render, Kiro

## Try it

- Live app: https://port-chimera.vercel.app
- Code: https://github.com/Zee-hub-496/PortChimera
- Demo documents: `fixtures/documents/demo-invoice.pdf`, `demo-packing-list.pdf`, `demo-certificate-of-origin.pdf`
- Video: [YouTube link]
- Note for judges: the API runs on a free host. If the first request is slow, wait about a minute.

## Screenshots to upload (take them yourself from the live app)

1. Document review with an evidence quote.
2. Cross-check finding: gross weight 500 kg against 650 kg.
3. Route page after closing a port, with the before and after cards.
4. The `.kiro` folder on GitHub (specs and steering).
