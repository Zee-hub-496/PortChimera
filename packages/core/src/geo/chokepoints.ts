// Major maritime chokepoints. Positions are approximate; the radius is a rough "a route within
// this distance passes through" value, not a legal or navigational boundary. The same ids are
// used by apps/web/src/lib/chokepoints.js (display), which this module does not replace.

import { densify, distanceKm, wrapLon } from './geo.ts';
import type { LonLat } from './geo.ts';

export interface Chokepoint {
  readonly id: string;
  readonly name: string;
  readonly lon: number;
  readonly lat: number;
  readonly radiusKm: number;
}

export const CHOKEPOINTS: readonly Chokepoint[] = Object.freeze([
  { id: 'malacca', name: 'Strait of Malacca', lon: 101.8, lat: 2.4, radiusKm: 110 },
  { id: 'hormuz', name: 'Strait of Hormuz', lon: 56.5, lat: 26.5, radiusKm: 80 },
  { id: 'bab-el-mandeb', name: 'Bab-el-Mandeb', lon: 43.4, lat: 12.6, radiusKm: 80 },
  { id: 'suez', name: 'Suez Canal', lon: 32.4, lat: 30.4, radiusKm: 90 },
  { id: 'gibraltar', name: 'Strait of Gibraltar', lon: -5.6, lat: 36.0, radiusKm: 80 },
  { id: 'dover', name: 'Strait of Dover', lon: 1.6, lat: 51.0, radiusKm: 60 },
  { id: 'cape-good-hope', name: 'Cape of Good Hope', lon: 18.5, lat: -34.4, radiusKm: 150 },
  { id: 'taiwan', name: 'Taiwan Strait', lon: 119.5, lat: 24.5, radiusKm: 120 },
  { id: 'panama', name: 'Panama Canal', lon: -79.7, lat: 9.1, radiusKm: 90 },
]);

const byId = new Map(CHOKEPOINTS.map((c) => [c.id, c]));

export const getChokepoint = (id: string): Chokepoint | undefined => byId.get(id);

/** Ids of the chokepoints a path passes through, in the order the path first reaches them. */
export function chokepointIdsOnPath(path: readonly LonLat[]): string[] {
  if (path.length === 0) return [];
  const norm: LonLat[] = path.map(([lon, lat]) => [wrapLon(lon), lat]);
  const pts = norm.length > 1 ? densify(norm, 25) : norm;
  const found: string[] = [];
  for (const p of pts) {
    for (const c of CHOKEPOINTS) {
      if (!found.includes(c.id) && distanceKm(p, [c.lon, c.lat]) <= c.radiusKm) found.push(c.id);
    }
  }
  return found;
}
