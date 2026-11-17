import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findRoute, makeCostFunction, makeHeuristic } from '../src/index.js';
import { bruteForceCost, dijkstraAll } from './helpers/references.js';
import { randomGraph, randomWeights } from './helpers/randomGraph.js';

// Floating-point slack for comparing costs that were summed in different orders.
const EPS = 1e-9;
const GRAPHS = 500;

describe('A* property tests (seeded random graphs)', () => {
  it(`returns the same cost as Dijkstra on ${GRAPHS} random graphs and weights`, () => {
    let found = 0;
    let unreachable = 0;
    for (let seed = 1; seed <= GRAPHS; seed++) {
      const { graph, random } = randomGraph(seed);
      const weights = randomWeights(random);
      const codes = [...graph.ports.keys()];
      const from = codes[Math.floor(random() * codes.length)];
      const to = codes[Math.floor(random() * codes.length)];

      const edgeCost = makeCostFunction(weights, graph.maxima);
      const expected = dijkstraAll(graph, from, edgeCost).get(to);
      const actual = findRoute(graph, from, to, weights);
      const context = `seed ${seed}, ${from}->${to}, weights ${JSON.stringify(weights)}`;

      if (expected === Infinity) {
        unreachable++;
        assert.equal(actual.status, 'no_route', context);
        continue;
      }
      found++;
      assert.equal(actual.status, 'found', context);
      assert.ok(
        Math.abs(actual.cost - expected) <= EPS,
        `${context}: A* ${actual.cost} vs Dijkstra ${expected}`,
      );
    }
    // Guard against a test that passes only because every case was trivial.
    assert.ok(found > GRAPHS * 0.5, `only ${found} of ${GRAPHS} cases had a route`);
    assert.ok(unreachable > 0, 'expected at least one unreachable case');
  });

  it('returns a valid path whose edges chain together and add up to the reported cost', () => {
    for (let seed = 1000; seed < 1200; seed++) {
      const { graph, random } = randomGraph(seed);
      const weights = randomWeights(random);
      const codes = [...graph.ports.keys()];
      const from = codes[Math.floor(random() * codes.length)];
      const to = codes[Math.floor(random() * codes.length)];
      const r = findRoute(graph, from, to, weights);
      if (r.status !== 'found') continue;

      assert.equal(r.path[0], from);
      assert.equal(r.path.at(-1), to);
      assert.equal(new Set(r.path).size, r.path.length, `seed ${seed}: path repeats a port`);
      r.edges.forEach((e, i) => {
        assert.equal(e.from, r.path[i]);
        assert.equal(e.to, r.path[i + 1]);
        assert.ok(graph.edges.includes(e), `seed ${seed}: edge is not from the graph`);
      });
      const edgeCost = makeCostFunction(weights, graph.maxima);
      const summed = r.edges.reduce((acc, e) => acc + edgeCost(e), 0);
      assert.ok(
        Math.abs(summed - r.cost) <= EPS,
        `seed ${seed}: edges sum to ${summed}, reported ${r.cost}`,
      );
    }
  });

  it('matches an exhaustive search of every possible path on small graphs', () => {
    for (let seed = 5000; seed < 5200; seed++) {
      const { graph, random } = randomGraph(seed, { minPorts: 3, maxPorts: 7, density: 0.45 });
      const weights = randomWeights(random);
      const codes = [...graph.ports.keys()];
      const from = codes[Math.floor(random() * codes.length)];
      const to = codes[Math.floor(random() * codes.length)];
      const edgeCost = makeCostFunction(weights, graph.maxima);
      const expected = bruteForceCost(graph, from, to, edgeCost);
      const actual = findRoute(graph, from, to, weights);
      if (expected === Infinity) assert.equal(actual.status, 'no_route', `seed ${seed}`);
      else
        assert.ok(
          Math.abs(actual.cost - expected) <= EPS,
          `seed ${seed}: ${actual.cost} vs ${expected}`,
        );
    }
  });

  it('never overestimates: h(n) is at most the true remaining cost for every port (admissible)', () => {
    for (let seed = 2000; seed < 2200; seed++) {
      const { graph, random } = randomGraph(seed);
      const weights = randomWeights(random);
      const edgeCost = makeCostFunction(weights, graph.maxima);
      const codes = [...graph.ports.keys()];
      const goal = codes[Math.floor(random() * codes.length)];
      const h = makeHeuristic(graph, goal, edgeCost);
      for (const code of codes) {
        const trueCost = dijkstraAll(graph, code, edgeCost).get(goal);
        if (trueCost === Infinity) continue;
        assert.ok(
          h(code) <= trueCost + EPS,
          `seed ${seed}: h(${code})=${h(code)} exceeds true cost ${trueCost}`,
        );
      }
    }
  });

  it('is consistent: h(a) <= cost(a,b) + h(b) for every lane', () => {
    for (let seed = 3000; seed < 3200; seed++) {
      const { graph, random } = randomGraph(seed);
      const weights = randomWeights(random);
      const edgeCost = makeCostFunction(weights, graph.maxima);
      const codes = [...graph.ports.keys()];
      const goal = codes[Math.floor(random() * codes.length)];
      const h = makeHeuristic(graph, goal, edgeCost);
      for (const edge of graph.edges) {
        assert.ok(
          h(edge.from) <= edgeCost(edge) + h(edge.to) + EPS,
          `seed ${seed}: inconsistent on ${edge.from}->${edge.to}`,
        );
      }
    }
  });

  it('finds equally cheap routes with and without the heuristic, and reports how much work it saves', () => {
    let strictlyFewer = 0;
    for (let seed = 4000; seed < 4300; seed++) {
      const { graph, random } = randomGraph(seed, { minPorts: 8, maxPorts: 14, density: 0.25 });
      const weights = randomWeights(random);
      const codes = [...graph.ports.keys()];
      const from = codes[Math.floor(random() * codes.length)];
      const to = codes[Math.floor(random() * codes.length)];
      const a = findRoute(graph, from, to, weights);
      const d = findRoute(graph, from, to, weights, { useHeuristic: false });
      assert.equal(a.status, d.status, `seed ${seed}`);
      // Both should find equally cheap routes; the heuristic only changes how much work it takes.
      if (a.status === 'found') assert.ok(Math.abs(a.cost - d.cost) <= EPS, `seed ${seed}`);
      if (a.expanded < d.expanded) strictlyFewer++;
    }
    console.log(
      `      (A* expanded strictly fewer ports than Dijkstra in ${strictlyFewer} of 300 graphs)`,
    );
  });
});
