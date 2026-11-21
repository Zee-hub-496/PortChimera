// Hand-drawn sea lanes for the seeded demo network. DISPLAY ONLY and illustrative:
// they are not vessel tracks, not navigational charts, and routing (A*) never reads them.
//
// Coordinates are [lon, lat] in degrees, the same order as GeoJSON and mapData.js.
// Each lane lists only the waypoints BETWEEN its two ports, in the direction written in the key.
// The ports themselves come from the route stops. The reverse lane reuses the list backwards.
// Between waypoints the path is a great-circle piece, so waypoints must be close enough that the
// piece stays in water. apps/web/test/seaLanes.test.js checks every lane against the land polygons.

import { densify } from './geo.js';

/** Longest great-circle piece drawn between two waypoints. */
export const LANE_STEP_KM = 120;

// Reusable stretches. Each is written in the direction named.

// Shanghai to the South China coast, through the Taiwan Strait.
const TAIWAN_STRAIT = [
  [122.8, 29.6],
  [121.2, 26.2],
  [119.7, 24.6],
  [118.2, 22.7],
];
// South China Sea, from off Hong Kong to the mouth of the Singapore Strait.
const SCS_TO_SINGAPORE = [
  [113.5, 19.6],
  [112.5, 16.0],
  [110.6, 11.5],
  [108.6, 9.0],
  [105.0, 5.5],
  [104.8, 2.3],
];
// Singapore Strait, east to west, then up the Strait of Malacca to Port Klang.
const SINGAPORE_STRAIT = [
  [104.7, 1.15],
  [103.4, 1.05],
];
const MALACCA_LOWER = [
  [102.3, 1.7],
  [101.0, 2.7],
];
// Port Klang out of the northern mouth of the Strait of Malacca.
const MALACCA_UPPER = [
  [100.6, 3.2],
  [100.0, 4.4],
  [98.0, 5.9],
  [95.0, 6.4],
];
// Andaman Sea and Bay of Bengal, from the Malacca mouth to just south of Sri Lanka, then to Colombo.
const BAY_OF_BENGAL = [
  [90.0, 6.2],
  [84.0, 5.3],
  [80.6, 5.3],
];
const COLOMBO_APPROACH = [[79.7, 6.0]];
// Colombo (or the Sri Lanka south coast) to the west coast of India and Karachi.
const INDIA_WEST_COAST = [
  [77.2, 7.2],
  [75.3, 10.0],
  [73.0, 14.5],
  [71.5, 18.5],
];
const GUJARAT_TO_KARACHI = [
  [69.5, 20.3],
  [68.3, 21.7],
  [67.4, 22.9],
  [66.7, 23.9],
];
// Gulf of Oman and the Strait of Hormuz to Jebel Ali, written from the Gulf of Oman side.
const HORMUZ_TO_JEBEL_ALI = [
  [57.3, 25.0],
  [56.8, 25.9],
  [56.6, 26.55],
  [55.6, 26.2],
];
// Pacific. From Japan's south coast out to the open ocean, then across to Los Angeles.
const JAPAN_SOUTH_TO_PACIFIC = [
  [142.0, 34.5],
  [150.0, 39.0],
  [165.0, 44.0],
  [180.0, 46.5],
  [-165.0, 45.0],
  [-150.0, 42.0],
  [-135.0, 38.0],
  [-123.0, 34.5],
  [-120.5, 33.5],
];
// Strait of Gibraltar to Rotterdam, up the Atlantic coast and through the English Channel.
const GIBRALTAR_TO_ATLANTIC = [
  [-5.7, 35.95],
  [-6.6, 36.1],
  [-9.8, 36.6],
];
const ATLANTIC_TO_ROTTERDAM = [
  [-10.5, 38.5],
  [-10.3, 41.5],
  [-10.2, 43.0],
  [-8.5, 45.5],
  [-6.0, 47.9],
  [-5.6, 49.4],
  [-3.0, 49.9],
  [-1.0, 50.1],
  [0.6, 50.2],
  [1.55, 51.0],
  [2.5, 51.5],
  [3.0, 51.8],
];

const rev = (list) => [...list].reverse();

/**
 * Waypoints per lane, keyed "FROM-TO" in the direction the waypoints are written.
 * Every two-way lane in scripts/routing-seed/definition.mjs has one entry.
 */
export const SEA_LANES = Object.freeze({
  // East Asia
  'CNSHA-KRPUS': [
    [123.5, 31.2],
    [126.0, 32.5],
    [128.5, 33.8],
  ],
  'KRPUS-JPYOK': [
    [129.6, 34.1],
    [128.9, 32.6],
    [130.4, 30.4],
    [133.5, 32.0],
    [135.5, 32.8],
    [137.5, 33.9],
    [139.3, 34.6],
  ],
  'CNSHA-HKHKG': [...TAIWAN_STRAIT, [115.0, 21.9]],
  'HKHKG-CNSZX': [],
  'CNSHA-USLAX': [
    [124.0, 30.5],
    [129.0, 30.5],
    [131.5, 30.3],
    [135.0, 32.3],
    [139.0, 33.8],
    ...JAPAN_SOUTH_TO_PACIFIC,
  ],
  'JPYOK-USLAX': [[140.0, 34.2], ...JAPAN_SOUTH_TO_PACIFIC],
  // Southeast Asia
  'CNSHA-SGSIN': [...TAIWAN_STRAIT, [116.0, 21.4], ...SCS_TO_SINGAPORE],
  'CNSHA-MYPKG': [
    ...TAIWAN_STRAIT,
    [116.0, 21.4],
    ...SCS_TO_SINGAPORE,
    ...SINGAPORE_STRAIT,
    ...MALACCA_LOWER,
  ],
  'HKHKG-SGSIN': [[114.6, 21.3], ...SCS_TO_SINGAPORE],
  'SGSIN-MYPKG': [...SINGAPORE_STRAIT, ...MALACCA_LOWER],
  // Indian Ocean and South Asia
  'SGSIN-PKKHI': [
    ...SINGAPORE_STRAIT,
    ...MALACCA_LOWER,
    ...MALACCA_UPPER,
    ...BAY_OF_BENGAL,
    ...INDIA_WEST_COAST,
    ...GUJARAT_TO_KARACHI,
  ],
  'SGSIN-LKCMB': [
    ...SINGAPORE_STRAIT,
    ...MALACCA_LOWER,
    ...MALACCA_UPPER,
    ...BAY_OF_BENGAL,
    ...COLOMBO_APPROACH,
  ],
  'MYPKG-LKCMB': [...MALACCA_UPPER, ...BAY_OF_BENGAL, ...COLOMBO_APPROACH],
  'LKCMB-PKKHI': [...INDIA_WEST_COAST, ...GUJARAT_TO_KARACHI],
  'LKCMB-INNSA': [...INDIA_WEST_COAST.slice(0, 3), [71.8, 18.3]],
  'INNSA-PKKHI': [[71.5, 20.0], ...GUJARAT_TO_KARACHI],
  'PKKHI-AEJEA': [[65.0, 24.2], [62.0, 24.4], [59.5, 24.5], ...HORMUZ_TO_JEBEL_ALI],
  'INNSA-AEJEA': [[70.5, 19.9], [65.0, 22.0], [62.0, 23.8], [59.5, 24.5], ...HORMUZ_TO_JEBEL_ALI],
  'PKKHI-OMSLL': [
    [65.0, 23.7],
    [61.0, 19.5],
    [57.5, 17.5],
    [55.2, 16.5],
  ],
  'LKCMB-OMSLL': [
    [76.0, 7.8],
    [68.0, 11.0],
    [60.0, 14.5],
    [55.5, 16.4],
  ],
  'OMSLL-AEJEA': [
    [54.7, 16.5],
    [55.8, 17.2],
    [57.0, 17.9],
    [60.0, 20.5],
    [61.0, 22.6],
    [59.5, 24.4],
    ...HORMUZ_TO_JEBEL_ALI,
  ],
  'SGSIN-AEJEA': [
    ...SINGAPORE_STRAIT,
    ...MALACCA_LOWER,
    ...MALACCA_UPPER,
    ...BAY_OF_BENGAL,
    [72.0, 9.0],
    [66.0, 15.0],
    [62.5, 21.0],
    [61.2, 22.8],
    [59.5, 24.4],
    ...HORMUZ_TO_JEBEL_ALI,
  ],
  // Red Sea, Suez and Mediterranean
  'OMSLL-DJJIB': [
    [50.5, 13.2],
    [47.0, 12.4],
    [44.3, 12.0],
  ],
  // Through Bab-el-Mandeb and up the Red Sea.
  'DJJIB-SAJED': [
    [44.0, 12.2],
    [43.4, 12.6],
    [42.7, 13.5],
    [41.6, 14.8],
    [40.8, 16.5],
    [39.8, 18.0],
    [38.8, 20.0],
  ],
  // Up the Red Sea, the Gulf of Suez, and through the Suez Canal.
  'SAJED-EGPSD': [
    [38.6, 22.5],
    [36.8, 24.5],
    [35.3, 26.5],
    [34.3, 27.4],
    [33.6, 27.8],
    [33.4, 28.0],
    [33.1, 28.3],
    [32.85, 28.8],
    [32.7, 29.2],
    [32.5, 29.7],
    [32.55, 29.95],
    [32.4, 30.3],
    [32.33, 30.8],
  ],
  'EGPSD-GRPIR': [
    [31.0, 32.7],
    [28.5, 33.5],
    [27.5, 35.2],
    [26.5, 36.0],
    [25.0, 36.3],
    [24.0, 37.2],
  ],
  'GRPIR-ESVLC': [
    [23.9, 37.2],
    [23.5, 36.2],
    [22.3, 35.9],
    [19.0, 36.5],
    [15.5, 36.3],
    [13.5, 36.5],
    [11.8, 37.6],
    [9.5, 38.0],
    [7.0, 38.0],
    [4.0, 38.3],
    [1.0, 38.5],
  ],
  // Out through the Strait of Gibraltar and up the Atlantic coast.
  'ESVLC-NLRTM': [
    [0.6, 38.9],
    [0.0, 37.5],
    [-2.5, 36.2],
    [-4.5, 36.2],
    ...GIBRALTAR_TO_ATLANTIC,
    ...ATLANTIC_TO_ROTTERDAM,
  ],
  // Around Africa
  'LKCMB-ZACPT': [
    [73.0, 0.0],
    [62.0, -14.0],
    [52.0, -27.0],
    [40.0, -35.0],
    [28.0, -37.0],
    [21.0, -36.5],
    [19.0, -35.4],
    [18.0, -34.5],
    [17.8, -33.9],
  ],
  'ZACPT-NLRTM': [
    [17.0, -32.5],
    [13.0, -25.0],
    [11.0, -17.0],
    [8.5, -5.0],
    [5.0, -2.0],
    [-3.0, 2.0],
    [-9.5, 3.0],
    [-15.5, 8.0],
    [-18.5, 14.5],
    [-18.0, 20.5],
    [-17.5, 25.0],
    [-13.5, 29.0],
    [-10.6, 32.0],
    [-9.8, 36.7],
    ...ATLANTIC_TO_ROTTERDAM,
  ],
});

const keyOf = (from, to) => `${from}-${to}`;

/**
 * Waypoints between two ports in the direction from to `to`, or null when the lane is not drawn.
 * @param {string} from port code
 * @param {string} to port code
 * @returns {Array<[number, number]> | null}
 */
export function seaLaneWaypoints(from, to) {
  const forward = SEA_LANES[keyOf(from, to)];
  if (forward) return forward.map((p) => [p[0], p[1]]);
  const back = SEA_LANES[keyOf(to, from)];
  return back ? rev(back).map((p) => [p[0], p[1]]) : null;
}

/** True when the pair has a hand-drawn lane, in either direction. */
export function hasSeaLane(from, to) {
  return seaLaneWaypoints(from, to) !== null;
}

/**
 * Full path for one leg: the start point, the lane waypoints, the end point, with great-circle
 * pieces of at most LANE_STEP_KM between them. Returns null when the lane is not drawn so the
 * caller can fall back to a great-circle arc.
 * @param {string} fromCode
 * @param {string} toCode
 * @param {[number, number]} start [lon, lat] of the first port
 * @param {[number, number]} end [lon, lat] of the second port
 * @param {number} [stepKm]
 * @returns {Array<[number, number]> | null}
 */
export function seaLanePath(fromCode, toCode, start, end, stepKm = LANE_STEP_KM) {
  const waypoints = seaLaneWaypoints(fromCode, toCode);
  if (!waypoints) return null;
  return densify([start, ...waypoints, end], stepKm);
}
