# Spec 06 design

## Overlay, not mutation

```
shared graph (ports + edges from DB)  --\
                                         applyDisruptions(graph, effects) --> NEW graph copy without closed items --> findRoute
active scenario effects (this user)   --/
```

`applyDisruptions` is a pure function in `packages/core/src/routing/disruptions.js`. It returns a **new** graph and leaves the input untouched
(a test freezes the input and checks it). That is why two users can run different crises at the same time.

Closing a port removes the port and every lane touching it. Closing a lane removes just that lane.
Origin or destination closed is detected before searching so we can give a precise message.

## Comparison

`compareRoutes(baseline, disrupted)` returns `{ status, addedDays, addedCostUsd, addedRisk, changedPath, explanation }` where
`status` is one of `unaffected`, `rerouted`, `no_route`, `origin_closed`, `destination_closed`.

## Endpoints (match the original plan)

- `POST /api/disruptions` create scenario with effects
- `GET /api/disruptions` list mine
- `POST /api/disruptions/:id/activate` and `/deactivate`
- `DELETE /api/disruptions/:id`
- `POST /api/routes/recalculate` body: shipment id, objective, scenario id

## Demo story to support

Shanghai -> Karachi baseline via Singapore. Close Singapore (port strike). The route moves via Port Klang and Colombo.
The seed data must make this alternative exist and be slower and costlier, or the demo says nothing. A test asserts it.

## Dashboard numbers

Computed by SQL over `route_results` and active scenarios. Everything is derived from saved data; no separate analytics tables.

## Tests

Closed transit port; closed lane; closed origin; closed destination; no alternative; unaffected route; input graph not mutated;
scenario deactivated gives the baseline again; user B cannot read or activate user A's scenario (API test, 404).
