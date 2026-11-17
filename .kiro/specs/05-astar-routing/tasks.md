# Spec 05 tasks

- [x] 1. Haversine distance with validation and tests (verified: 5 tests pass)
Tasks 2 to 7 verified in the authoring sandbox (Node 22, 54 core tests pass). Confirm with `npm test` on your machine.
Mutation check: making the heuristic overestimate (x5) made 5 tests fail; restoring it made all pass.

- [x] 2. Binary min-heap + tests
- [x] 3. `buildGraph` with validation (edge not shorter than straight line, unknown ports, duplicates) + tests (R1)
- [x] 4. Cost function with normalization + weights validation + tests (R2)
- [x] 5. Dijkstra reference and exhaustive-search reference (test helpers)
- [x] 6. `findRoute` A* with heuristic, tie-breaking, start==goal, no_route + tests (R3)
- [x] 7. Property tests: A* equals Dijkstra on 500 random graphs; equals exhaustive search on 200 small graphs; heuristic admissible and consistent on 200 graphs each (R3.3)
- [ ] 8. Explanation builder + tests (R4)
- [ ] 9. Seed data (~20 ports, lanes) + generator script + test that the seed passes graph validation (R1.2, R1.3)
- [ ] 10. API endpoint `POST /api/routes/calculate` with zod validation, ownership, save to `route_results` (R5)
- [ ] 11. Web: route simulator page with objective selector, results panel, map (R4, R6)
- [ ] 12. Write the admissibility argument into `docs/ALGORITHMS.md` for the write-up
