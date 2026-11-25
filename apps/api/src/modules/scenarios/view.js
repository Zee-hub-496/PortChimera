/** Maps database rows to the camelCase objects the API returns. user_id is never exposed. */
export function toEffectView(row) {
  return {
    id: row.id,
    type: row.effect_type,
    portId: row.port_id ?? null,
    edgeId: row.edge_id ?? null,
    note: row.note ?? null,
    createdAt: row.created_at,
  };
}

export function toScenarioView(row, effectRows = []) {
  return {
    id: row.id,
    name: row.name,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    effects: effectRows.map(toEffectView),
  };
}

const pickRoute = (r) => (r ? { path: r.path, pathNames: r.pathNames, totals: r.totals } : null);

/** The part of a core simulation result the client needs. Internal route objects stay server-side. */
export function toSimulationView({ scenarioId, shipmentId, result, resultId }) {
  return {
    scenarioId,
    shipmentId,
    objective: result.objective,
    weights: result.weights,
    status: result.status,
    explanation: result.explanation,
    dataLabel: result.dataLabel ?? null,
    closed: result.closed,
    baseline: pickRoute(result.baseline),
    disrupted: pickRoute(result.disrupted),
    added: result.added,
    changedPorts: result.changedPorts,
    savedResultId: resultId ?? null,
  };
}
