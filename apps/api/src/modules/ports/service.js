import { AppError } from '../../middleware/errorHandler.js';

/** Lists every port (shared reference data) for the form dropdowns. */
export async function listPorts(db) {
  const { data, error } = await db
    .from('ports')
    .select('code, name, country, lat, lon, data_label')
    .order('code', { ascending: true });
  if (error) throw new AppError(500, 'PORT_LIST_FAILED', 'Could not load ports');
  return (data ?? []).map((p) => ({
    code: p.code,
    name: p.name,
    country: p.country,
    lat: p.lat,
    lon: p.lon,
    dataLabel: p.data_label,
  }));
}

/**
 * The shared shipping network with database ids, for choosing what a disruption scenario closes.
 * Read only. Lanes are directed: a connection that works both ways appears twice.
 */
export async function getNetwork(db) {
  const [portsRes, edgesRes] = await Promise.all([
    db.from('ports').select('id, code, name, country, lat, lon').order('code', { ascending: true }),
    db
      .from('shipping_edges')
      .select(
        'id, source_port_id, destination_port_id, distance_km, transit_days, freight_cost_usd, risk_score',
      ),
  ]);
  if (portsRes.error || edgesRes.error) {
    throw new AppError(500, 'NETWORK_LOAD_FAILED', 'Could not load the shipping network');
  }
  const ports = portsRes.data ?? [];
  const codeById = new Map(ports.map((p) => [p.id, p.code]));
  const lanes = (edgesRes.data ?? [])
    .map((e) => ({
      id: e.id,
      from: codeById.get(e.source_port_id),
      to: codeById.get(e.destination_port_id),
      distanceKm: Number(e.distance_km),
      transitDays: Number(e.transit_days),
      freightCostUsd: Number(e.freight_cost_usd),
      riskScore: Number(e.risk_score),
    }))
    .filter((l) => l.from && l.to)
    .sort((a, b) => `${a.from}${a.to}`.localeCompare(`${b.from}${b.to}`));
  return {
    ports: ports.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      country: p.country,
      lat: Number(p.lat),
      lon: Number(p.lon),
    })),
    lanes,
  };
}
