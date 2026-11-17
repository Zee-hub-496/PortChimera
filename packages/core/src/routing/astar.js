import { haversineKm } from './haversine.js';
import { MinHeap } from './heap.js';
import { RoutingInputError } from './errors.js';
import { makeCostFunction, resolveObjective } from './cost.js';

/**
 * The smallest "cost per kilometre" found on any lane in the graph.
 *
 * Why this makes the heuristic safe: every lane costs at least (its length * minCostPerKm),
 * every lane is at least as long as the straight line between its ports (enforced by
 * buildGraph), so any route to the goal costs at least straight-line-distance * minCostPerKm.
 * That lower bound never overestimates, which is what "admissible" means.
 *
 * @param {ReturnType<import('./graph.js').buildGraph>} graph
 * @param {(edge: object) => number} edgeCost
 */
export function minCostPerKm(graph, edgeCost) {
  let min = Infinity;
  for (const edge of graph.edges) {
    min = Math.min(min, edgeCost(edge) / edge.distanceKm);
  }
  // An empty graph has no lanes; 0 is the safe answer (the heuristic then does nothing).
  return Number.isFinite(min) ? min : 0;
}

/**
 * h(n) = straight-line distance from n to the goal * minCostPerKm
 */
export function makeHeuristic(graph, goalCode, edgeCost) {
  const goal = graph.ports.get(goalCode);
  const perKm = minCostPerKm(graph, edgeCost);
  const cache = new Map();
  return (code) => {
    if (perKm === 0) return 0; // no usable bound, behave like Dijkstra (still correct)
    if (!cache.has(code)) cache.set(code, haversineKm(graph.ports.get(code), goal) * perKm);
    return cache.get(code);
  };
}

const round6 = (n) => Math.round(n * 1e6) / 1e6;

function requirePort(graph, code, role) {
  if (!graph.ports.has(code)) {
    throw new RoutingInputError(`Unknown ${role} port "${code}"`);
  }
}

/** Queue order: lowest f first. Equal f falls back to port code so results are repeatable. */
const byPriority = (a, b) => a.f - b.f || a.code.localeCompare(b.code);

/**
 * Finds the lowest-cost route using A* search.
 *
 *   f(n) = g(n) + h(n)
 *   g(n): real cost of the best route found so far from the origin to n
 *   h(n): optimistic estimate of the cost still to go (see makeHeuristic)
 *   f(n): estimated total cost of a route that passes through n
 *
 * We always explore the port with the lowest f next. Because h never overestimates,
 * the first time the goal comes off the queue, its route is the cheapest possible.
 *
 * "No route" is a normal result, not an error: `{ status: 'no_route' }`.
 * Bad input (unknown port, invalid weights) throws RoutingInputError.
 *
 * @param {ReturnType<import('./graph.js').buildGraph>} graph
 * @param {string} from origin port code
 * @param {string} to destination port code
 * @param {string | {time: number, cost: number, risk: number}} [objectiveOrWeights]
 * @param {{useHeuristic?: boolean, scale?: object}} [options]
 *   useHeuristic: set false to run plain Dijkstra (used to measure what the heuristic saves)
 *   scale: normalization maxima; pass the ORIGINAL graph's maxima when searching a disrupted copy
 */
export function findRoute(graph, from, to, objectiveOrWeights = 'fastest', options = {}) {
  const { objective, weights } = resolveObjective(objectiveOrWeights);
  const { useHeuristic = true, scale = graph.maxima } = options;
  requirePort(graph, from, 'origin');
  requirePort(graph, to, 'destination');

  const edgeCost = makeCostFunction(weights, scale);
  const base = { objective, weights, dataLabel: graph.dataLabel };

  if (from === to) {
    return {
      status: 'found',
      ...base,
      path: [from],
      edges: [],
      cost: 0,
      totals: totalsOf([]),
      expanded: 0,
    };
  }

  const h = useHeuristic ? makeHeuristic(graph, to, edgeCost) : () => 0;

  const bestCost = new Map([[from, 0]]); // g(n): cheapest known cost to reach each port
  const arrivedBy = new Map(); // port code -> the edge that reached it cheapest
  const open = new MinHeap(byPriority);
  open.push({ code: from, g: 0, f: h(from) });
  let expanded = 0;

  while (open.size > 0) {
    const current = open.pop();

    // A port can be queued more than once if a cheaper way to it was found later.
    // Skip queue entries that have been superseded.
    if (current.g > bestCost.get(current.code)) continue;

    if (current.code === to) {
      const edges = rebuildEdges(arrivedBy, from, to);
      return {
        status: 'found',
        ...base,
        path: [from, ...edges.map((e) => e.to)],
        edges,
        cost: current.g,
        totals: totalsOf(edges),
        expanded,
      };
    }

    expanded += 1;
    for (const edge of graph.adjacency.get(current.code)) {
      const g = current.g + edgeCost(edge);
      // Strictly cheaper only. This also stops zero-cost loops from running forever.
      if (g < (bestCost.get(edge.to) ?? Infinity)) {
        bestCost.set(edge.to, g);
        arrivedBy.set(edge.to, edge);
        open.push({ code: edge.to, g, f: g + h(edge.to) });
      }
    }
  }

  return {
    status: 'no_route',
    ...base,
    reason: `No sequence of available lanes connects ${from} to ${to}`,
    expanded,
  };
}

function rebuildEdges(arrivedBy, from, to) {
  const edges = [];
  for (let code = to; code !== from;) {
    const edge = arrivedBy.get(code);
    edges.push(edge);
    code = edge.from;
  }
  return edges.reverse();
}

function totalsOf(edges) {
  const sum = (pick) => round6(edges.reduce((acc, e) => acc + pick(e), 0));
  return {
    transitDays: sum((e) => e.transitDays),
    freightCostUsd: sum((e) => e.freightCostUsd),
    riskSum: sum((e) => e.riskScore),
    riskMax: edges.reduce((max, e) => Math.max(max, e.riskScore), 0),
  };
}
