// Major maritime chokepoints, for display only. Positions are approximate and the radius is a
// rough "route passes near here" distance, not a legal or navigational boundary.
// Coordinates are [lon, lat] like the rest of the map code.

import { distanceKm, densify } from './geo.js';

const NOTE = 'Narrow sea passage. Closures reroute traffic.';

/**
 * @typedef {object} Chokepoint
 * @property {string} id
 * @property {string} name
 * @property {number} lon
 * @property {number} lat
 * @property {number} radiusKm a route within this distance counts as passing through
 * @property {string} note one line shown in the tooltip
 * @property {boolean} usedBySeed whether any lane of the seeded demo network passes through
 */

/** @type {ReadonlyArray<Readonly<Chokepoint>>} */
export const CHOKEPOINTS = Object.freeze(
  [
    {
      id: 'malacca',
      name: 'Strait of Malacca',
      lon: 101.8,
      lat: 2.4,
      radiusKm: 110,
      note: NOTE,
      usedBySeed: true,
    },
    {
      id: 'hormuz',
      name: 'Strait of Hormuz',
      lon: 56.5,
      lat: 26.5,
      radiusKm: 80,
      note: NOTE,
      usedBySeed: true,
    },
    {
      id: 'bab-el-mandeb',
      name: 'Bab-el-Mandeb',
      lon: 43.4,
      lat: 12.6,
      radiusKm: 80,
      note: NOTE,
      usedBySeed: true,
    },
    {
      id: 'suez',
      name: 'Suez Canal',
      lon: 32.4,
      lat: 30.4,
      radiusKm: 90,
      note: 'Canal between the Red Sea and the Mediterranean. Closures reroute traffic.',
      usedBySeed: true,
    },
    {
      id: 'gibraltar',
      name: 'Strait of Gibraltar',
      lon: -5.6,
      lat: 36.0,
      radiusKm: 80,
      note: NOTE,
      usedBySeed: true,
    },
    {
      id: 'dover',
      name: 'Strait of Dover',
      lon: 1.6,
      lat: 51.0,
      radiusKm: 60,
      note: NOTE,
      usedBySeed: true,
    },
    {
      id: 'cape-good-hope',
      name: 'Cape of Good Hope',
      lon: 18.5,
      lat: -34.4,
      radiusKm: 150,
      note: 'Southern tip route around Africa. Used when the Suez corridor is closed.',
      usedBySeed: true,
    },
    {
      id: 'taiwan',
      name: 'Taiwan Strait',
      lon: 119.5,
      lat: 24.5,
      radiusKm: 120,
      note: NOTE,
      usedBySeed: true,
    },
    {
      id: 'panama',
      name: 'Panama Canal',
      lon: -79.7,
      lat: 9.1,
      radiusKm: 90,
      note: 'Canal between the Atlantic and the Pacific. Not used by the demo network.',
      usedBySeed: false,
    },
  ].map((c) => Object.freeze(c)),
);

/**
 * The chokepoints a path passes through, in the order the path first reaches them.
 * The path is checked at a spacing finer than the smallest radius, so sparse input still works.
 * @param {Array<[number, number]>} path [lon, lat] points, longitudes may be unwrapped
 * @returns {Chokepoint[]}
 */
export function chokepointsOnPath(path) {
  if (!Array.isArray(path) || path.length === 0) return [];
  const norm = path.map(([lon, lat]) => [lon - 360 * Math.floor((lon + 180) / 360), lat]);
  const pts = norm.length > 1 ? densify(norm, 25) : norm;
  const found = new Map();
  for (const p of pts) {
    for (const c of CHOKEPOINTS) {
      if (!found.has(c.id) && distanceKm(p, [c.lon, c.lat]) <= c.radiusKm) found.set(c.id, c);
    }
  }
  return [...found.values()];
}
