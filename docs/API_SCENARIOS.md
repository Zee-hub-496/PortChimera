# Crisis simulation API (Day 3)

All routes are under `/api/scenarios`, need a sign-in, and answer `{ data }` or `{ error: { code, message } }`. A scenario belongs to the signed-in user; anyone else gets `404 SCENARIO_NOT_FOUND`. The shared `ports` and `shipping_edges` tables are only read, never written: a scenario is a list of "closed" markers applied to a private copy of the graph.

| Method and path                               | Body                           | Result                                         |
| --------------------------------------------- | ------------------------------ | ---------------------------------------------- |
| `POST /api/scenarios`                         | `{ name, effects?: [effect] }` | 201, the scenario with its effects             |
| `GET /api/scenarios`                          |                                | the caller's scenarios, newest first           |
| `GET /api/scenarios/:id`                      |                                | one scenario                                   |
| `PATCH /api/scenarios/:id`                    | `{ name?, isActive? }`         | the updated scenario                           |
| `DELETE /api/scenarios/:id`                   |                                | `{ id }`; also deletes its saved route results |
| `POST /api/scenarios/:id/effects`             | one effect                     | 201, the scenario (close a port or lane)       |
| `DELETE /api/scenarios/:id/effects/:effectId` |                                | the scenario (reopen)                          |
| `POST /api/scenarios/:id/simulate`            | `{ shipmentId, objective? }`   | the simulation result (below)                  |

An effect is `{ type, portId | edgeId, note? }`. `type` is `port_strike`, `port_congestion` (ports only), `connection_failure` (lanes only) or `severe_weather` (either). `portId` and `edgeId` are the ids from the `ports` and `shipping_edges` tables. A lane effect closes one direction; to close a connection both ways, add the reverse lane too.

Errors: unknown port or lane `422 UNKNOWN_PORT` / `UNKNOWN_LANE`; type does not fit the target `422 EFFECT_INVALID`; same target twice `422 EFFECT_DUPLICATE` (create) or `409 EFFECT_EXISTS` (add).

## Simulation result

`status` is one of `rerouted`, `unaffected`, `no_route`, `origin_closed`, `destination_closed`, `baseline_unavailable`. The numbers and the plain-English `explanation` come from `simulateDisruption` in `@portchimera/core`, so the API gives the same routes as the core tests. The result has `baseline` and `disrupted` (`{ path, pathNames, totals }`, `disrupted` is null when there is no route), `added` (extra days, dollars, risk), `changedPorts`, `closed`, `objective`, `weights`, `dataLabel` and `savedResultId`.

A route is saved to `route_results` only when one exists (`rerouted`, `unaffected`): one baseline row (`scenario_id` null, created once per shipment and objective) and one disrupted row that a re-run replaces. The other outcomes are returned and recorded in the audit log only. Changing a scenario's effects deletes its saved results, so none go stale.

Audit actions: `scenario.created`, `scenario.updated`, `scenario.deleted`, `scenario.effect_added`, `scenario.effect_removed`, `scenario.simulated`.

`isActive` is stored for the UI. Simulating does not depend on it.

## Choosing what to close: `GET /api/ports/network`

Read only. Returns `{ ports, lanes }` with database ids, which the scenario routes need. `ports` is `[{ id, code, name, country, lat, lon }]`. `lanes` is `[{ id, from, to, distanceKm, transitDays, freightCostUsd, riskScore }]`, where `from` and `to` are port codes. Lanes are directed, so a two-way connection appears twice.

## Crisis overview: `GET /api/scenarios/impact`

Read-only. Runs every saved scenario of the caller (up to 20, each with at least one effect) against every shipment of the caller that has both ports (up to 100), for the fastest route, and returns which shipments each scenario affects. It saves nothing and writes no audit entry. A "crisis" here is a scenario the user defined, not live news. The page `/crisis` shows it.

```
{ data: {
    objective: "fastest", dataLabel: "illustrative",
    checked: { scenarios, shipments }, limited: false, affectedShipments: 1,
    crises: [ {
      scenarioId, name,
      effects: [ { type, kind: "port" | "lane", target: "Singapore" } ],
      affected: [ { ...simulation result fields (see above), shipmentId, shipmentNumber,
                    shipmentStatus, origin: {code,name}, destination: {code,name} } ]
    } ] } }
```

Only statuses that change or block the route are listed: `rerouted`, `no_route`, `origin_closed`, `destination_closed`. Crises that hit nothing are still returned with an empty `affected` list. Crises that hit the most shipments come first.
