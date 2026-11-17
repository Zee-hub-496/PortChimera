// Independent reference implementations used ONLY by tests, to check A* against.
// They are deliberately simple and share no code with astar.js (no heap, no heuristic).

/**
 * Dijkstra by repeatedly scanning for the closest unvisited port. O(V^2): slow but obvious.
 * @returns {Map<string, number>} cheapest cost from `source` to every port (Infinity = unreachable)
 */
export function dijkstraAll(graph, source, edgeCost) {
  const dist = new Map([...graph.ports.keys()].map((code) => [code, Infinity]));
  dist.set(source, 0);
  const visited = new Set();

  for (;;) {
    let best = null;
    for (const [code, d] of dist) {
      if (visited.has(code) || d === Infinity) continue;
      if (best === null || d < dist.get(best)) best = code;
    }
    if (best === null) break;
    visited.add(best);
    for (const edge of graph.adjacency.get(best)) {
      const candidate = dist.get(best) + edgeCost(edge);
      if (candidate < dist.get(edge.to)) dist.set(edge.to, candidate);
    }
  }
  return dist;
}

/**
 * Tries every simple path (no repeated port) and returns the cheapest cost, or Infinity.
 * Only usable on tiny graphs, but it cannot share a bug with Dijkstra or A*.
 */
export function bruteForceCost(graph, from, to, edgeCost) {
  let best = Infinity;
  const visit = (code, costSoFar, seen) => {
    if (code === to) {
      best = Math.min(best, costSoFar);
      return;
    }
    for (const edge of graph.adjacency.get(code)) {
      if (seen.has(edge.to)) continue;
      seen.add(edge.to);
      visit(edge.to, costSoFar + edgeCost(edge), seen);
      seen.delete(edge.to);
    }
  };
  visit(from, 0, new Set([from]));
  return best;
}
