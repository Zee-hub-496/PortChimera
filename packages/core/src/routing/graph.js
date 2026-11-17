import { haversineKm } from './haversine.js';
import { RoutingInputError } from './errors.js';

// Floating-point slack when comparing a lane length with the straight-line distance.
const DISTANCE_EPSILON_KM = 1e-6;

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Builds a validated shipping graph.
 *
 * Ports are nodes. Lanes are DIRECTED edges: a two-way lane needs one edge in each direction.
 * Everything is validated here, once, so the search code can trust its input.
 *
 * The most important check is the last one for each edge: a lane may never be shorter than the
 * straight-line distance between its ports. The A* heuristic relies on that. See
 * `.kiro/specs/05-astar-routing/design.md` for the full argument.
 *
 * @param {Array<{code: string, name?: string, lat: number, lon: number}>} ports
 * @param {Array<{id?: string, from: string, to: string, distanceKm: number,
 *   transitDays: number, freightCostUsd: number, riskScore: number}>} edges
 * @param {{dataLabel?: string}} [options] dataLabel travels with every result, e.g. 'illustrative'
 */
export function buildGraph(ports, edges, { dataLabel = null } = {}) {
  if (!Array.isArray(ports) || !Array.isArray(edges)) {
    throw new RoutingInputError('buildGraph needs a ports array and an edges array');
  }

  const portMap = new Map();
  for (const p of ports) {
    if (typeof p?.code !== 'string' || p.code.trim() === '') {
      throw new RoutingInputError('Every port needs a non-empty string code');
    }
    if (portMap.has(p.code)) throw new RoutingInputError(`Duplicate port code ${p.code}`);
    if (!isNumber(p.lat) || !isNumber(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) {
      throw new RoutingInputError(`Port ${p.code} has invalid coordinates`);
    }
    portMap.set(
      p.code,
      Object.freeze({ code: p.code, name: p.name ?? p.code, lat: p.lat, lon: p.lon }),
    );
  }

  const adjacency = new Map([...portMap.keys()].map((code) => [code, []]));
  const seenPairs = new Set();
  const cleanEdges = [];
  const maxima = { transitDays: 0, freightCostUsd: 0, riskScore: 0 };

  for (const e of edges) {
    const label = `${e?.from} -> ${e?.to}`;
    const from = portMap.get(e?.from);
    const to = portMap.get(e?.to);
    if (!from) throw new RoutingInputError(`Edge ${label}: unknown origin port`);
    if (!to) throw new RoutingInputError(`Edge ${label}: unknown destination port`);
    if (e.from === e.to)
      throw new RoutingInputError(`Edge ${label}: a port cannot connect to itself`);

    const pair = `${e.from}>${e.to}`;
    if (seenPairs.has(pair)) throw new RoutingInputError(`Duplicate edge ${label}`);
    seenPairs.add(pair);

    if (!isNumber(e.distanceKm) || e.distanceKm <= 0) {
      throw new RoutingInputError(`Edge ${label}: distanceKm must be a positive number`);
    }
    if (!isNumber(e.transitDays) || e.transitDays <= 0) {
      throw new RoutingInputError(`Edge ${label}: transitDays must be a positive number`);
    }
    if (!isNumber(e.freightCostUsd) || e.freightCostUsd < 0) {
      throw new RoutingInputError(`Edge ${label}: freightCostUsd must be zero or more`);
    }
    if (!isNumber(e.riskScore) || e.riskScore < 0 || e.riskScore > 1) {
      throw new RoutingInputError(`Edge ${label}: riskScore must be between 0 and 1`);
    }

    const straightLineKm = haversineKm(from, to);
    if (e.distanceKm < straightLineKm - DISTANCE_EPSILON_KM) {
      throw new RoutingInputError(
        `Edge ${label}: distanceKm ${e.distanceKm} is shorter than the straight-line distance ` +
          `${straightLineKm.toFixed(1)} km. The A* heuristic would overestimate and could return ` +
          'a worse route, so this data is rejected.',
      );
    }

    const edge = Object.freeze({
      ...(e.id !== undefined ? { id: e.id } : {}),
      from: e.from,
      to: e.to,
      distanceKm: e.distanceKm,
      transitDays: e.transitDays,
      freightCostUsd: e.freightCostUsd,
      riskScore: e.riskScore,
    });
    cleanEdges.push(edge);
    adjacency.get(e.from).push(edge);
    maxima.transitDays = Math.max(maxima.transitDays, e.transitDays);
    maxima.freightCostUsd = Math.max(maxima.freightCostUsd, e.freightCostUsd);
    maxima.riskScore = Math.max(maxima.riskScore, e.riskScore);
  }

  // Sorting neighbours by destination code means results never depend on the order the
  // database happened to return rows in. Same data in, same route out.
  for (const list of adjacency.values()) list.sort((a, b) => a.to.localeCompare(b.to));

  return Object.freeze({
    ports: portMap,
    edges: Object.freeze(cleanEdges),
    adjacency,
    maxima: Object.freeze(maxima),
    dataLabel,
  });
}
