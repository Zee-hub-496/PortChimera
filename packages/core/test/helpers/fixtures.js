import { buildGraph } from '../../src/index.js';

/**
 * A small hand-made graph where the three objectives disagree.
 *
 *   S --> X --> T   fast but expensive and risky
 *   S --> Y --> T   cheap, but slow
 *   S --> Z --> T   safest, but slow and pricey
 *
 * Lane lengths are set far above the straight-line distance so the graph is valid.
 */
export function threeRouteGraph() {
  const ports = [
    { code: 'S', lat: 0, lon: 0 },
    { code: 'X', lat: 0, lon: 10 },
    { code: 'Y', lat: 10, lon: 10 },
    { code: 'Z', lat: -10, lon: 10 },
    { code: 'T', lat: 0, lon: 20 },
  ];
  const lane = (from, to, transitDays, freightCostUsd, riskScore) => ({
    from,
    to,
    distanceKm: 4000,
    transitDays,
    freightCostUsd,
    riskScore,
  });
  const edges = [
    lane('S', 'X', 5, 3000, 0.8),
    lane('X', 'T', 5, 3000, 0.8),
    lane('S', 'Y', 20, 500, 0.5),
    lane('Y', 'T', 20, 500, 0.5),
    lane('S', 'Z', 30, 2000, 0.05),
    lane('Z', 'T', 30, 2000, 0.05),
  ];
  return buildGraph(ports, edges, { dataLabel: 'test' });
}
