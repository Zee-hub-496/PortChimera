import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RoutingInputError, buildGraph, findRoute } from '../src/index.js';
import { threeRouteGraph } from './helpers/fixtures.js';

const approx = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not close to ${b}`);

// Lanes in these tiny graphs are long enough to satisfy the straight-line rule.
const lane = (from, to, extra = {}) => ({
  from,
  to,
  distanceKm: 20000,
  transitDays: 10,
  freightCostUsd: 1000,
  riskScore: 0.2,
  ...extra,
});
const at = (code, lat, lon) => ({ code, lat, lon });

describe('findRoute: basic cases', () => {
  it('finds a direct lane', () => {
    const g = buildGraph([at('A', 0, 0), at('B', 0, 5)], [lane('A', 'B')]);
    const r = findRoute(g, 'A', 'B', 'fastest');
    assert.equal(r.status, 'found');
    assert.deepEqual(r.path, ['A', 'B']);
    assert.equal(r.totals.transitDays, 10);
    assert.equal(r.totals.freightCostUsd, 1000);
    assert.equal(r.edges.length, 1);
  });

  it('returns a one-port route with zero cost when origin equals destination', () => {
    const r = findRoute(threeRouteGraph(), 'S', 'S', 'cheapest');
    assert.equal(r.status, 'found');
    assert.deepEqual(r.path, ['S']);
    assert.equal(r.cost, 0);
    assert.equal(r.totals.transitDays, 0);
    assert.equal(r.expanded, 0);
  });

  it('reports no_route (not an exception) when the ports are not connected', () => {
    const g = buildGraph([at('A', 0, 0), at('B', 0, 5), at('C', 0, 9)], [lane('A', 'B')]);
    const r = findRoute(g, 'A', 'C');
    assert.equal(r.status, 'no_route');
    assert.match(r.reason, /A to C/);
  });

  it('respects lane direction', () => {
    const g = buildGraph([at('A', 0, 0), at('B', 0, 5)], [lane('B', 'A')]);
    assert.equal(findRoute(g, 'A', 'B').status, 'no_route');
    assert.equal(findRoute(g, 'B', 'A').status, 'found');
  });

  it('throws a clear error for unknown ports', () => {
    const g = threeRouteGraph();
    assert.throws(
      () => findRoute(g, 'NOPE', 'T'),
      (e) => e instanceof RoutingInputError && /origin port "NOPE"/.test(e.message),
    );
    assert.throws(() => findRoute(g, 'S', 'NOPE'), /destination port "NOPE"/);
  });

  it('throws for unknown objectives and invalid weights', () => {
    const g = threeRouteGraph();
    assert.throws(() => findRoute(g, 'S', 'T', 'shortest'), RoutingInputError);
    assert.throws(() => findRoute(g, 'S', 'T', { time: 0, cost: 0, risk: 0 }), RoutingInputError);
  });

  it('carries the data label through to the result', () => {
    assert.equal(findRoute(threeRouteGraph(), 'S', 'T').dataLabel, 'test');
  });
});

describe('findRoute: objectives pick different routes', () => {
  const g = threeRouteGraph();

  it('fastest goes through X', () => {
    const r = findRoute(g, 'S', 'T', 'fastest');
    assert.deepEqual(r.path, ['S', 'X', 'T']);
    assert.equal(r.totals.transitDays, 10);
    assert.equal(r.totals.freightCostUsd, 6000);
  });

  it('cheapest goes through Y', () => {
    const r = findRoute(g, 'S', 'T', 'cheapest');
    assert.deepEqual(r.path, ['S', 'Y', 'T']);
    assert.equal(r.totals.freightCostUsd, 1000);
  });

  it('lowest_risk goes through Z', () => {
    const r = findRoute(g, 'S', 'T', 'lowest_risk');
    assert.deepEqual(r.path, ['S', 'Z', 'T']);
    approx(r.totals.riskSum, 0.1);
    assert.equal(r.totals.riskMax, 0.05);
  });

  it('custom weights are labeled custom and behave like a time-only objective', () => {
    const r = findRoute(g, 'S', 'T', { time: 1, cost: 0, risk: 0 });
    assert.equal(r.objective, 'custom');
    assert.deepEqual(r.path, ['S', 'X', 'T']);
  });

  it('reports a total cost that matches the sum of its edges', () => {
    const r = findRoute(g, 'S', 'T', 'cheapest');
    const w = r.weights;
    const sum = r.edges.reduce(
      (acc, e) =>
        acc +
        w.time * (e.transitDays / g.maxima.transitDays) +
        w.cost * (e.freightCostUsd / g.maxima.freightCostUsd) +
        w.risk * (e.riskScore / g.maxima.riskScore),
      0,
    );
    approx(r.cost, sum);
  });
});

describe('findRoute: multiple routes and ties', () => {
  it('chooses the cheaper of two multi-hop routes even if the other has fewer hops', () => {
    // A -> B direct is expensive. A -> C -> B is two hops but much cheaper in time.
    const g = buildGraph(
      [at('A', 0, 0), at('B', 0, 10), at('C', 0, 5)],
      [
        lane('A', 'B', { transitDays: 40 }),
        lane('A', 'C', { transitDays: 5 }),
        lane('C', 'B', { transitDays: 5 }),
      ],
    );
    assert.deepEqual(findRoute(g, 'A', 'B', { time: 1, cost: 0, risk: 0 }).path, ['A', 'C', 'B']);
  });

  it('breaks exact ties by port code, whatever order the data came in', () => {
    // A and B sit symmetrically north and south of the line S-T, so every distance, cost
    // and heuristic value is identical and only the tie-break can decide.
    const ports = [at('S', 0, 0), at('A', 1, 5), at('B', -1, 5), at('T', 0, 10)];
    const edges = [lane('S', 'B'), lane('B', 'T'), lane('S', 'A'), lane('A', 'T')];
    const forward = buildGraph(ports, edges);
    const reversed = buildGraph([...ports].reverse(), [...edges].reverse());
    assert.deepEqual(findRoute(forward, 'S', 'T').path, ['S', 'A', 'T']);
    assert.deepEqual(findRoute(reversed, 'S', 'T').path, ['S', 'A', 'T']);
  });

  it('does not loop forever on zero-cost cycles', () => {
    const g = buildGraph(
      [at('A', 0, 0), at('B', 0, 5), at('C', 0, 10)],
      [
        lane('A', 'B', { riskScore: 0 }),
        lane('B', 'A', { riskScore: 0 }),
        lane('B', 'C', { riskScore: 0 }),
      ],
    );
    const r = findRoute(g, 'A', 'C', { time: 0, cost: 0, risk: 1 });
    assert.equal(r.status, 'found');
    assert.equal(r.cost, 0);
  });
});

describe('findRoute: the heuristic', () => {
  it('finds the same route as plain Dijkstra while exploring fewer ports', () => {
    // The real route heads east: S -> M -> T, lanes almost as short as the straight line.
    // A decoy branch heads west from S. Plain Dijkstra wastes work on it; the heuristic
    // knows the goal is to the east and never expands the decoy.
    const ports = [
      at('S', 0, 0),
      at('M', 0, 5),
      at('T', 0, 10),
      at('W1', 0, -20),
      at('W2', 0, -23),
    ];
    const edges = [
      lane('S', 'M', { distanceKm: 560 }),
      lane('M', 'T', { distanceKm: 560 }),
      lane('S', 'W1', { distanceKm: 2230 }),
      lane('W1', 'W2', { distanceKm: 340 }),
    ];
    const g = buildGraph(ports, edges);
    const withH = findRoute(g, 'S', 'T', 'fastest');
    const withoutH = findRoute(g, 'S', 'T', 'fastest', { useHeuristic: false });
    approx(withH.cost, withoutH.cost);
    assert.deepEqual(withH.path, ['S', 'M', 'T']);
    assert.deepEqual(withoutH.path, ['S', 'M', 'T']);
    assert.ok(
      withH.expanded < withoutH.expanded,
      `A* expanded ${withH.expanded}, Dijkstra expanded ${withoutH.expanded}`,
    );
  });
});
