/**
 * Pure mapper from database rows (uuids, snake_case) to the input of core's buildGraph
 * (port codes, camelCase). Edges that point at a port we do not have are skipped, because the
 * graph builder would reject the whole graph.
 *
 * @returns {{ports: object[], edges: object[], dataLabel: string | null}}
 */
export function mapRowsToGraphInput(portRows, edgeRows) {
  const codeById = new Map(portRows.map((p) => [p.id, p.code]));
  const ports = portRows.map((p) => ({
    code: p.code,
    name: p.name,
    lat: Number(p.lat),
    lon: Number(p.lon),
  }));
  const edges = [];
  for (const e of edgeRows) {
    const from = codeById.get(e.source_port_id);
    const to = codeById.get(e.destination_port_id);
    if (!from || !to) continue;
    edges.push({
      id: e.id,
      from,
      to,
      distanceKm: Number(e.distance_km),
      transitDays: Number(e.transit_days),
      freightCostUsd: Number(e.freight_cost_usd),
      riskScore: Number(e.risk_score),
    });
  }
  const labels = new Set(portRows.map((p) => p.data_label).filter(Boolean));
  const dataLabel = labels.size === 1 ? [...labels][0] : labels.size > 1 ? 'mixed' : null;
  return { ports, edges, dataLabel };
}
