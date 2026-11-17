---
inclusion: always
---

# Testing rules

- Runner: Node's built-in `node:test` with `node:assert/strict`. Run all tests with `npm test`; core only with `npm run test:core`.
- Tests live next to their package: `packages/core/test/`, `apps/api/test/`. Name files `*.test.js`.
- Write tests in the same task as the feature. A task is not done until its tests pass.
- `packages/core` tests need no network, database or env vars and must stay that way.
- A* correctness: compare against a plain Dijkstra on many random graphs (the test oracle). Also test: direct route, multiple routes, each objective, disrupted node, disrupted edge, no route, start equals destination, disrupted destination.
- Cross-check: matching docs, weight/quantity/origin/currency mismatch, unit differences (kg vs g), missing fields, harmless formatting differences.
- Security tests: missing token, invalid token, another user's shipment (expect 404), bad file type, oversized file, invalid body, no secrets in responses.
- AI tests use a fake provider: valid output, malformed output, timeout, rate limit, evidence not found in text, injected instructions inside document text.
- When a bug is found, first write a failing test that reproduces it, then fix it.
- Report honestly what was and was not run. Do not describe a feature as working because it compiles.
