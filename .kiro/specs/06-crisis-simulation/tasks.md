# Spec 06 tasks

Tasks 1 to 3 verified in the authoring sandbox (Node 22, 112 non-network tests pass). Confirm with `npm test` locally.
Mutation checks: an overlay that leaves a closed port's lanes in the graph, and a simulation that uses the shrunken graph's own scale, each made tests fail.

- [x] 1. `applyDisruptions` pure function + tests including "does not mutate input" (R2)
  - Effects: `{ type, portCode }` closes a port; `{ type, from, to }` closes one directed lane. Unknown ports or lanes are rejected, not ignored.
- [x] 2. `simulateDisruption` (baseline, overlay, comparison, explanation) + status cases + tests (R3)
  - Statuses: unaffected, rerouted, no_route, origin_closed, destination_closed, baseline_unavailable.
- [x] 3. Tests that the seed produces the Singapore-strike alternative and other scenarios (R3, demo story)
- [ ] 4. Scenario CRUD and activate/deactivate endpoints with ownership checks + audit (R1, R4)
- [ ] 5. `POST /api/routes/recalculate` saves results with scenario id (R3, R4)
- [ ] 6. Authorization tests: another user's scenario returns 404
- [ ] 7. Web: scenario builder, port picker, activate/restore buttons
- [ ] 8. Web: before/after map and table, failure states (R5)
- [ ] 9. Dashboard impact cards (R5.3)
