# Spec 06: Crisis and disruption simulation

## Goal
Let a user close a port or lane in a private what-if scenario, recalculate a shipment's route, and see exactly what
the disruption costs in days, dollars and risk. The shared shipping graph is never modified.

## Requirements

### R1. Scenarios
1. THE user SHALL create a named scenario containing one or more effects, each closing one port OR one lane, with a type: port strike, severe weather, port congestion, connection failure.
2. THE user SHALL activate and deactivate a scenario. Scenarios SHALL be visible only to their owner.
3. WHEN a scenario is deactivated or deleted THEN routing SHALL behave exactly as before (restore).

### R2. Overlay
1. WHEN routing with an active scenario THEN a closed port SHALL NOT be used as a transit, origin or destination port, and a closed lane SHALL NOT be traversed.
2. THE overlay SHALL be applied in memory to a copy; the shared graph and database rows SHALL be unchanged.

### R3. Recalculation and comparison
1. WHEN a scenario is activated for a shipment THEN the system SHALL compute the baseline route and the disrupted route with the same objective.
2. THE comparison SHALL report: old route, new route, additional days, additional cost, change in risk, and an explanation that names the closed element.
3. WHEN the origin or destination port is closed THEN the result SHALL say no valid route exists and why.
4. WHEN no alternative route exists THEN the result SHALL be a clear failure state, not an error.
5. WHEN the baseline route is not affected by the scenario THEN the result SHALL say the route is unaffected.

### R4. Persistence and audit
1. THE system SHALL save disrupted route results with the scenario id and write audit entries for scenario creation, activation, deactivation, and recalculation.

### R5. Presentation
1. THE UI SHALL show original vs alternative routes on the map, the disrupted element highlighted, and a before/after table.
2. THE UI SHALL label all values illustrative.
3. THE dashboard SHALL show: active disruptions, shipments whose route is affected, and total additional days and cost for them.
