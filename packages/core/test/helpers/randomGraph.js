import { buildGraph, haversineKm } from '../../src/index.js';
import { seededRandom } from './random.js';

/**
 * Builds a random but VALID graph (lanes are never shorter than the straight line).
 * Includes zero-risk lanes sometimes, because that is the tricky case for the heuristic.
 */
export function randomGraph(seed, { minPorts = 4, maxPorts = 12, density = 0.3 } = {}) {
  const random = seededRandom(seed);
  const between = (lo, hi) => lo + random() * (hi - lo);

  const count = minPorts + Math.floor(random() * (maxPorts - minPorts + 1));
  const ports = Array.from({ length: count }, (_, i) => ({
    code: `P${String(i).padStart(2, '0')}`,
    lat: between(-60, 60),
    lon: between(-170, 170),
  }));

  const edges = [];
  for (const a of ports) {
    for (const b of ports) {
      if (a === b || random() > density) continue;
      edges.push({
        from: a.code,
        to: b.code,
        // 1.0x to 1.9x the straight line: real sea lanes are longer than the great circle.
        distanceKm: Math.max(1, haversineKm(a, b) * between(1, 1.9)),
        transitDays: between(1, 40),
        freightCostUsd: between(100, 6000),
        riskScore: random() < 0.15 ? 0 : random(),
      });
    }
  }
  return { graph: buildGraph(ports, edges), random };
}

/** Random non-negative weights that are never all zero. Some weights are exactly zero. */
export function randomWeights(random) {
  const pick = () => (random() < 0.25 ? 0 : random());
  const weights = { time: pick(), cost: pick(), risk: pick() };
  if (weights.time + weights.cost + weights.risk === 0) weights.time = 1;
  return weights;
}
