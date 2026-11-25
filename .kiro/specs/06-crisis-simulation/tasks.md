# Spec 06 tasks

Tasks 1 to 3 verified in the authoring sandbox (Node 22, 112 non-network tests pass). Confirm with `npm test` locally.
Mutation checks: an overlay that leaves a closed port's lanes in the graph, and a simulation that uses the shrunken graph's own scale, each made tests fail.

- [x] 1. `applyDisruptions` pure function + tests including "does not mutate input" (R2)
  - Effects: `{ type, portCode }` closes a port; `{ type, from, to }` closes one directed lane. Unknown ports or lanes are rejected, not ignored.
- [x] 2. `simulateDisruption` (baseline, overlay, comparison, explanation) + status cases + tests (R3)
  - Statuses: unaffected, rerouted, no_route, origin_closed, destination_closed, baseline_unavailable.
- [x] 3. Tests that the seed produces the Singapore-strike alternative and other scenarios (R3, demo story)
- [x] 4. Scenario CRUD and activate/deactivate endpoints with ownership checks + audit (R1, R4)
  - Day 3 (`modules/scenarios`): create, list, update, delete, add and remove effects, with ownership checks and audit. See `docs/API_SCENARIOS.md`. Tested with fakes.
- [x] 5. `POST /api/routes/recalculate` saves results with scenario id (R3, R4)
  - Built as `POST /api/scenarios/:id/simulate` (not `/api/routes/recalculate`). Results are saved with the scenario id; a "no route" outcome is returned and audited but not stored.
- [x] 6. Authorization tests: another user's scenario returns 404
  - Day 3: `apps/api/test/scenarios.test.js` checks that Bob gets 404 for Alice's scenario. Fakes only, no real database.
- [x] 7. Web: scenario builder, port picker, activate/restore buttons
  - Day 4: `ScenarioPanel.jsx` on the route page (close or reopen a port or lane, switch, delete, reset). Not yet clicked through in a browser by the author.
- [x] 8. Web: before/after map and table, failure states (R5)
  - Day 4: `SimulationSummary.jsx` and map overlay with all failure states. The Playwright run at 1280px and 390px is NOT done.
- [-] 9. Dashboard impact cards (R5.3)
  - Not built. The dashboard has a card that points to the route page, with no impact numbers.
