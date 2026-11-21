// Builds the compact world basemap used by the map.
// Input: Natural Earth 1:110m admin 0 countries GeoJSON (public domain, naturalearthdata.com).
// Run offline from a saved copy of the file:
//   node scripts/build-world-geojson.mjs /path/to/ne_110m_admin_0_countries.geojson
// Output: apps/web/src/assets/world-110m.json (name and geometry only, 2 decimal places).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DECIMALS = 2;
const DROP = new Set(['Antarctica']);
const OUT = fileURLToPath(new URL('../apps/web/src/assets/world-110m.json', import.meta.url));

const round = (n) => Number(n.toFixed(DECIMALS));

function simplifyRing(ring) {
  const out = [];
  for (const [lon, lat] of ring) {
    const p = [round(lon), round(lat)];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
}

/** Converts a Natural Earth FeatureCollection into the compact asset. */
export function buildWorld(source) {
  const features = [];
  for (const f of source.features) {
    const name = f.properties?.NAME ?? f.properties?.name ?? '';
    if (DROP.has(name) || !f.geometry) continue;
    const polygons =
      f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const kept = polygons
      .map((poly) => poly.map(simplifyRing).filter((r) => r.length >= 4))
      .filter((poly) => poly.length > 0);
    if (!kept.length) continue;
    features.push({
      type: 'Feature',
      properties: { name },
      geometry: { type: 'MultiPolygon', coordinates: kept },
    });
  }
  return { type: 'FeatureCollection', features };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const input = process.argv[2];
  if (!input) {
    console.error(
      'Usage: node scripts/build-world-geojson.mjs <ne_110m_admin_0_countries.geojson>',
    );
    process.exit(1);
  }
  const world = buildWorld(JSON.parse(readFileSync(input, 'utf8')));
  writeFileSync(OUT, JSON.stringify(world));
  console.log(`Wrote ${OUT} with ${world.features.length} countries`);
}
