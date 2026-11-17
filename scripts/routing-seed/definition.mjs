// Source of truth for the demo shipping network.
//
// ALL OF THIS IS ILLUSTRATIVE. Port coordinates are real but rounded. Lane lengths, transit
// times, freight costs and risk scores are produced by the simple formulas below. They are NOT
// shipping quotes, schedules or risk assessments, and the app labels them "illustrative".
//
// Run `npm run seed:generate` after editing; a test fails if the generated files are stale.

import { buildGraph, haversineKm } from '../../packages/core/src/index.js';

export const DATA_LABEL = 'illustrative';

// code (UN/LOCODE style), name, ISO country, latitude, longitude
export const PORTS = [
  ['CNSHA', 'Shanghai', 'CN', 31.23, 121.47],
  ['CNSZX', 'Shenzhen', 'CN', 22.54, 114.05],
  ['HKHKG', 'Hong Kong', 'HK', 22.3, 114.17],
  ['KRPUS', 'Busan', 'KR', 35.1, 129.04],
  ['JPYOK', 'Yokohama', 'JP', 35.44, 139.64],
  ['SGSIN', 'Singapore', 'SG', 1.26, 103.82],
  ['MYPKG', 'Port Klang', 'MY', 3.0, 101.39],
  ['LKCMB', 'Colombo', 'LK', 6.94, 79.85],
  ['PKKHI', 'Karachi', 'PK', 24.84, 66.98],
  ['INNSA', 'Nhava Sheva (Mumbai)', 'IN', 18.95, 72.95],
  ['AEJEA', 'Jebel Ali', 'AE', 25.01, 55.06],
  ['OMSLL', 'Salalah', 'OM', 16.94, 54.0],
  ['DJJIB', 'Djibouti', 'DJ', 11.59, 43.15],
  ['SAJED', 'Jeddah', 'SA', 21.48, 39.17],
  ['EGPSD', 'Port Said', 'EG', 31.26, 32.3],
  ['GRPIR', 'Piraeus', 'GR', 37.94, 23.64],
  ['ESVLC', 'Valencia', 'ES', 39.45, -0.32],
  ['NLRTM', 'Rotterdam', 'NL', 51.95, 4.14],
  ['ZACPT', 'Cape Town', 'ZA', -33.92, 18.43],
  ['USLAX', 'Los Angeles', 'US', 33.73, -118.26],
];

// Formula defaults. Individual lanes can override them.
const DEFAULTS = {
  factor: 1.3, // sea lanes are longer than the great-circle line: length = straight line * factor
  usdPerKm: 0.3, // illustrative freight price per km
  handlingUsd: 200, // illustrative fixed cost per lane
  kmPerDay: 780, // about 17 knots
  handlingDays: 1, // port time
};

// Two-way lanes. [portA, portB, optional overrides]. Each becomes two directed edges.
export const LANES = [
  // East Asia
  ['CNSHA', 'KRPUS'],
  ['KRPUS', 'JPYOK'],
  ['CNSHA', 'HKHKG'],
  ['HKHKG', 'CNSZX'],
  ['CNSHA', 'USLAX', { factor: 1.15 }],
  ['JPYOK', 'USLAX', { factor: 1.15 }],
  // Southeast Asia: Shanghai reaches Singapore directly, or reaches Port Klang on a slower, pricier feeder
  ['CNSHA', 'SGSIN', { factor: 1.25 }],
  ['CNSHA', 'MYPKG', { factor: 1.5, usdPerKm: 0.36, risk: 0.22 }],
  ['HKHKG', 'SGSIN'],
  ['SGSIN', 'MYPKG', { factor: 1.6 }],
  // Indian Ocean and South Asia
  // Direct and quick, but priced higher and scored riskier: this is what makes the objectives differ
  ['SGSIN', 'PKKHI', { factor: 1.25, usdPerKm: 0.42, risk: 0.4 }],
  ['SGSIN', 'LKCMB'],
  ['MYPKG', 'LKCMB'],
  ['LKCMB', 'PKKHI'],
  ['LKCMB', 'INNSA'],
  ['INNSA', 'PKKHI'],
  ['PKKHI', 'AEJEA'],
  ['INNSA', 'AEJEA'],
  ['PKKHI', 'OMSLL'],
  ['LKCMB', 'OMSLL'],
  ['OMSLL', 'AEJEA'],
  ['SGSIN', 'AEJEA', { factor: 1.25 }],
  // Red Sea, Suez and Mediterranean
  ['OMSLL', 'DJJIB'],
  ['DJJIB', 'SAJED'],
  ['SAJED', 'EGPSD'],
  ['EGPSD', 'GRPIR'],
  ['GRPIR', 'ESVLC'],
  ['ESVLC', 'NLRTM'],
  // Around Africa (the long alternative if the Suez corridor is closed)
  ['LKCMB', 'ZACPT', { factor: 1.2 }],
  ['ZACPT', 'NLRTM', { factor: 1.2 }],
];

const round = (n, digits) => Math.round(n * 10 ** digits) / 10 ** digits;

/** Builds the full seed (ports plus directed edges) from the definition above. */
export function buildSeed() {
  const ports = PORTS.map(([code, name, country, lat, lon]) => ({
    code,
    name,
    country,
    lat,
    lon,
    dataLabel: DATA_LABEL,
  }));
  const byCode = new Map(ports.map((p) => [p.code, p]));

  const edges = [];
  for (const [a, b, overrides = {}] of LANES) {
    const portA = byCode.get(a);
    const portB = byCode.get(b);
    if (!portA || !portB) throw new Error(`Lane ${a}-${b} uses an unknown port`);
    const o = { ...DEFAULTS, ...overrides };

    const distanceKm = Math.ceil(haversineKm(portA, portB) * o.factor);
    const transitDays = round(distanceKm / o.kmPerDay + o.handlingDays, 1);
    const freightCostUsd = Math.round(distanceKm * o.usdPerKm + o.handlingUsd);
    const riskScore = overrides.risk ?? round(0.06 + distanceKm * 0.00002, 2);

    for (const [from, to] of [
      [a, b],
      [b, a],
    ]) {
      edges.push({
        from,
        to,
        distanceKm,
        transitDays,
        freightCostUsd,
        riskScore,
        dataLabel: DATA_LABEL,
      });
    }
  }

  // Fail loudly if the data breaks the rules the A* heuristic relies on.
  buildGraph(ports, edges, { dataLabel: DATA_LABEL });
  return { ports, edges };
}

const sqlText = (s) => `'${String(s).replaceAll("'", "''")}'`;

/** SQL that loads the same data into the `ports` and `shipping_edges` tables. */
export function buildSql({ ports, edges }) {
  const portRows = ports
    .map(
      (p) =>
        `  (${sqlText(p.code)}, ${sqlText(p.name)}, ${sqlText(p.country)}, ${p.lat}, ${p.lon}, ${sqlText(p.dataLabel)})`,
    )
    .join(',\n');
  const edgeRows = edges
    .map(
      (e) =>
        `  (${sqlText(e.from)}, ${sqlText(e.to)}, ${e.distanceKm}, ${e.transitDays}, ${e.freightCostUsd}, ${e.riskScore}, ${sqlText(e.dataLabel)})`,
    )
    .join(',\n');

  return `-- GENERATED by scripts/generate-routing-seed.mjs. Do not edit by hand.
-- Illustrative demo shipping network: ${ports.length} ports, ${edges.length} directed lanes.
-- Port coordinates are approximate. Distances, times, costs and risk scores are formula-based
-- demo values, NOT real quotes or risk assessments.
--
-- STATUS: not yet run against a real Postgres. Safe to re-run (it skips rows that already exist).

insert into public.ports (code, name, country, lat, lon, data_label) values
${portRows}
on conflict (code) do nothing;

insert into public.shipping_edges
  (source_port_id, destination_port_id, distance_km, transit_days, freight_cost_usd, risk_score, data_label)
select s.id, d.id, v.distance_km, v.transit_days, v.freight_cost_usd, v.risk_score, v.data_label
from (values
${edgeRows}
) as v (src, dst, distance_km, transit_days, freight_cost_usd, risk_score, data_label)
join public.ports s on s.code = v.src
join public.ports d on d.code = v.dst
on conflict (source_port_id, destination_port_id) do nothing;
`;
}
