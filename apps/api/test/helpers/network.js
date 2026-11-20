import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const seedPath = (name) =>
  fileURLToPath(new URL(`../../../../supabase/seed/${name}`, import.meta.url));

/** Loads the illustrative seed files and converts them to the shape the database returns. */
export function seedAsDbRows() {
  const ports = JSON.parse(readFileSync(seedPath('ports.json'), 'utf8')).map((p, i) => ({
    id: `port-uuid-${i}`,
    code: p.code,
    name: p.name,
    country: p.country,
    lat: p.lat,
    lon: p.lon,
    data_label: p.dataLabel,
  }));
  const idByCode = new Map(ports.map((p) => [p.code, p.id]));
  const edges = JSON.parse(readFileSync(seedPath('edges.json'), 'utf8')).map((e, i) => ({
    id: `edge-uuid-${i}`,
    source_port_id: idByCode.get(e.from),
    destination_port_id: idByCode.get(e.to),
    distance_km: e.distanceKm,
    transit_days: e.transitDays,
    freight_cost_usd: e.freightCostUsd,
    risk_score: e.riskScore,
    data_label: e.dataLabel,
  }));
  return { ports, edges };
}
