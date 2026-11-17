# How Kiro was used to build PortChimera

A running log for the hackathon write-up. Add an entry whenever Kiro changes how something is built.
Keep entries concrete: what was asked, what Kiro produced, what was verified, what was fixed.

## 2026-11-17: Foundation session

**Planning before code.** Kiro reviewed the original specification before writing anything, and found problems that changed the design:
auth defined twice (Supabase and custom endpoints), RLS that the backend would have bypassed with a service-role key,
disruptions that would have changed a shared graph, and a scope too large for 17 days. Each became a recorded decision in
`.kiro/steering/architecture.md`.

**Steering files** (`.kiro/steering/`): product rules, architecture and the dependency rule for `packages/core`, conventions, API,
database, security, AI integration, testing. Some load always; others only when matching files are open (`fileMatch`).

**Specs** (`.kiro/specs/01..08`): each with requirements (testable statements), design, and tasks. Task status uses
`[x]` verified, `[-]` written but unverified, `[ ]` not started, so the list never overstates progress.

**What Kiro could not do, and how it was handled.**

- The authoring sandbox had no npm registry access, so dependency-based tests could not run there.
  Kiro switched the test runner to Node's built-in `node:test`, ran what could run (core and error-handler tests, 9 passing),
  and marked the rest unverified instead of claiming success.
- Official Google and Devpost pages returned 403 to the sandbox, so Gemini model names and limits and the hackathon's
  repository rules were **not** confirmed there. They are listed as manual checks in specs 02 and 08.
- No Postgres was available, so the migration is marked "not yet run".

**Verification examples.** The secret scanner was proven by planting a fake key and confirming it failed the scan.

## Hooks, agents, MCP

To be recorded here when added.

## 2026-11-17: Routing engine and disruption overlay

**Spec-driven build.** The A\* and crisis specs (`.kiro/specs/05`, `06`) were written first. The code follows their design
documents, and the task lists record what was verified.

**Tests that can fail.** Passing tests are not evidence unless they can fail. Each engine was broken on purpose to confirm tests notice:
a heuristic that overestimates (5 tests failed), a seed edit without regenerating files (sync test failed), an overlay that leaves a closed
port's lanes in the graph (tests failed), and a simulation that costs routes with the wrong scale (the scale test failed).

**Bugs found by running things, not by reading.** Two test setups were wrong the first time (a tie-break test whose costs were not
actually tied, and an "opposite direction" test that silently emptied its input). One explanation sentence began in lowercase.
Each was fixed after a run exposed it.

**A process mistake, recorded honestly.** A stacked pull request was merged into its parent branch after the parent had already merged into
`main`, so the seed data missed `main` and needed a second pull request. Later PRs target `main` directly.

**A bug only the author's machine could find.** After the overlay merged, the author ran `npm test` on Windows and one test failed:
Git had converted the generated seed SQL to CRLF line endings, which a byte-for-byte comparison treated as a content change. The authoring
sandbox runs Linux, so it could not see this. Fix: the test now ignores line-ending style, and `.gitattributes` forces LF everywhere.
The fix was verified by converting the file to CRLF on purpose, and by checking that a real content change still fails the test.

## 2026-11-17: Cross-document checker

**Spec corrected before building.** Writing the percent formula exposed a contradiction in the spec Kiro had written earlier: the requirement said
500 kg vs 650 kg is "30%", the design's formula gives 23.1%. The requirement was fixed and the definition (difference divided by the larger value)
was made order-independent, with a test that swapping the documents gives the same number.

**A domain problem found by running the fixtures.** The first version paired a certificate of origin's single summary line ("Cotton t-shirts and
denim jeans") with the first invoice line and reported a false "wording differs" finding. Certificates summarize goods, so they are now checked by
word coverage against all invoice lines. The fix was driven by a fixture whose correct answer is "no findings".

**Honest edge cases chosen on purpose:** the unit "tons" is refused (metric, short and long tons differ by up to 10%); unrecognized countries give
a medium finding instead of high; and "nothing compared" reports `not_enough_data`, never `consistent`.

**Mutation checks:** removing the tolerance, the company-suffix rules, the larger-value percent, the critical rule, or the tonne conversion each
made between 1 and 12 tests fail.

## 2026-11-18: API login protection (spec 01)

**What Kiro produced:** a `requireAuth` middleware, a Supabase token verifier, `GET /api/auth/me`, an audit helper and `docs/SETUP_SUPABASE.md`, with tests that use fake Supabase clients.

**Verified:** 26 new tests pass in the authoring sandbox. Five deliberate breakages of the code were each caught by a failing test, then restored.

**Not verified:** the Express route tests and the production environment test have not been run (dependencies cannot be installed in the sandbox). Nothing has been tried against a real Supabase project, and the migration has not been run. The setup guide lists the manual checks.
