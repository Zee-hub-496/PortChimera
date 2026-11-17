# Spec 05: A* route optimization

## Goal
Find the best shipping route between two ports for a chosen objective, using a genuine A* search with a
provably safe heuristic, in a pure library that has no dependency on the UI or database.

## Requirements

### R1. Graph
1. THE system SHALL model ports as nodes and directed shipping lanes as edges with `distance_km`, `transit_days`, `freight_cost_usd`, `risk_score`.
2. WHEN a graph is built THEN the system SHALL reject any edge whose `distance_km` is less than the straight-line distance between its ports, because that would break the heuristic.
3. THE seed data SHALL be labeled illustrative and SHALL include the Shanghai -> Karachi alternatives (via Singapore; via Port Klang and Colombo).

### R2. Cost function
1. THE edge cost SHALL be `alpha*T + beta*F + gamma*R` where T, F, R are each divided by the maximum of that attribute over the graph, so all three lie in [0, 1].
2. THE system SHALL provide objectives: `fastest` (time-heavy), `cheapest` (cost-heavy), `lowest_risk` (risk-heavy), and SHALL accept custom weights that are non-negative and not all zero.

### R3. Search
1. THE system SHALL use A* with `f(n) = g(n) + h(n)`.
2. THE heuristic SHALL be `h(n) = haversine(n, goal) * minCostPerKm`, which never overestimates the true remaining cost.
3. THE search SHALL return the lowest-cost route, and for any graph SHALL return the same total cost as Dijkstra.
4. WHEN start equals goal THEN the result SHALL be a one-port route with zero cost.
5. WHEN no route exists THEN the result SHALL be a clear `no_route` failure, not an exception.
6. WHEN a port code is unknown THEN the system SHALL return a validation error.
7. Ties SHALL be broken deterministically (by port code) so results are repeatable.

### R4. Output
1. THE result SHALL contain: ordered ports, total transit days, total freight cost, total risk (sum and max edge), objective, weights, and a plain-language explanation of why this route won, including the runner-up difference when one exists.
2. THE result SHALL carry the data label (`illustrative`).

### R5. API
1. `POST /api/routes/calculate` SHALL accept origin, destination, objective (or weights) and optional scenario id, and SHALL validate input.
2. THE route result SHALL be saved to `route_results` when a shipment id is given.

### R6. Visualization
1. THE web app SHALL draw the ports and the chosen route on a map. THE routing logic SHALL NOT depend on the map library.
