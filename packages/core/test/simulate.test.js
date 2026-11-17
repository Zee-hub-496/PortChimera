import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RoutingInputError,
  buildGraph,
  findRoute,
  makeCostFunction,
  simulateDisruption,
} from '../src/index.js';
import { threeRouteGraph } from './helpers/fixtures.js';

const strike = (portCode) => ({ type: 'port_strike', portCode });
const approx = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not close to ${b}`);

describe('simulateDisruption: rerouting', () => {
  const g = threeRouteGraph();

  it('re-plans around a closed transit port and measures the impact', () => {
    // Fastest route S>X>T (10 days, $6,000). With X closed the next best fastest is S>Y>T (40 days, $1,000).
    const r = simulateDisruption(g, [strike('X')], 'S', 'T', 'fastest');
    assert.equal(r.status, 'rerouted');
    assert.deepEqual(r.baseline.path, ['S', 'X', 'T']);
    assert.deepEqual(r.disrupted.path, ['S', 'Y', 'T']);
    assert.equal(r.added.days, 30);
    assert.equal(r.added.costUsd, -5000);
    assert.deepEqual(r.changedPorts, { dropped: ['X'], added: ['Y'] });
  });

  it('re-plans around a closed lane', () => {
    const r = simulateDisruption(
      g,
      [{ type: 'connection_failure', from: 'X', to: 'T' }],
      'S',
      'T',
      'fastest',
    );
    assert.equal(r.status, 'rerouted');
    assert.deepEqual(r.disrupted.path, ['S', 'Y', 'T']);
  });

  it('closing one direction of a two-way lane affects only trips that use that direction', () => {
    const lane = (from, to) => ({
      from,
      to,
      distanceKm: 900,
      transitDays: 2,
      freightCostUsd: 10,
      riskScore: 0.1,
    });
    const twoWay = buildGraph(
      [
        { code: 'A', lat: 0, lon: 0 },
        { code: 'B', lat: 0, lon: 5 },
      ],
      [lane('A', 'B'), lane('B', 'A')],
    );
    const closeBtoA = [{ type: 'connection_failure', from: 'B', to: 'A' }];
    assert.equal(simulateDisruption(twoWay, closeBtoA, 'A', 'B').status, 'unaffected');
    assert.equal(simulateDisruption(twoWay, closeBtoA, 'B', 'A').status, 'no_route');
  });

  it('works with custom weights', () => {
    const r = simulateDisruption(g, [strike('X')], 'S', 'T', { time: 1, cost: 0, risk: 0 });
    assert.equal(r.objective, 'custom');
    assert.equal(r.status, 'rerouted');
  });

  it('costs both routes with the ORIGINAL scale, so they are comparable', () => {
    // Closing X removes the lanes with the largest cost and risk, which would change a
    // freshly computed scale. The disrupted cost must still use the original one.
    const r = simulateDisruption(g, [strike('X')], 'S', 'T', 'fastest');
    const original = makeCostFunction(r.weights, g.maxima);
    const sumOriginal = r.disruptedRoute.edges.reduce((acc, e) => acc + original(e), 0);
    approx(r.disruptedRoute.cost, sumOriginal);

    const shrunk = { transitDays: 30, freightCostUsd: 2000, riskScore: 0.5 }; // maxima without X's lanes
    const sumShrunk = r.disruptedRoute.edges.reduce(
      (acc, e) => acc + makeCostFunction(r.weights, shrunk)(e),
      0,
    );
    assert.ok(
      Math.abs(sumShrunk - sumOriginal) > 1e-6,
      'the two scales should give different totals',
    );
  });
});

describe('simulateDisruption: other outcomes', () => {
  const g = threeRouteGraph();

  it('is unaffected when the closure is not on the chosen route', () => {
    const r = simulateDisruption(g, [strike('Z')], 'S', 'T', 'fastest');
    assert.equal(r.status, 'unaffected');
    assert.deepEqual(r.added, { days: 0, costUsd: 0, risk: 0 });
    assert.deepEqual(r.disrupted.path, r.baseline.path);
    assert.match(r.explanation, /does not touch/);
  });

  it('can be unaffected for one objective and rerouted for another', () => {
    assert.equal(simulateDisruption(g, [strike('X')], 'S', 'T', 'cheapest').status, 'unaffected');
    assert.equal(simulateDisruption(g, [strike('X')], 'S', 'T', 'fastest').status, 'rerouted');
  });

  it('reports no_route when there is no alternative', () => {
    const r = simulateDisruption(g, [strike('X'), strike('Y'), strike('Z')], 'S', 'T', 'fastest');
    assert.equal(r.status, 'no_route');
    assert.equal(r.disrupted, null);
    assert.match(r.explanation, /no alternative route exists/);
  });

  it('reports origin_closed and destination_closed without searching', () => {
    const origin = simulateDisruption(g, [strike('S')], 'S', 'T');
    assert.equal(origin.status, 'origin_closed');
    assert.match(origin.explanation, /origin port is closed/);

    const destination = simulateDisruption(g, [strike('T')], 'S', 'T');
    assert.equal(destination.status, 'destination_closed');
    assert.match(destination.explanation, /destination port is closed/);
  });

  it('mentions both ends when both are closed', () => {
    const r = simulateDisruption(g, [strike('S'), strike('T')], 'S', 'T');
    assert.equal(r.status, 'origin_closed');
    assert.match(r.explanation, /origin and destination port is closed/);
  });

  it('says so when no route existed before the disruption', () => {
    const lonely = buildGraph(
      [
        { code: 'A', lat: 0, lon: 0 },
        { code: 'B', lat: 0, lon: 5 },
        { code: 'C', lat: 0, lon: 9 },
      ],
      [{ from: 'A', to: 'B', distanceKm: 900, transitDays: 2, freightCostUsd: 10, riskScore: 0.1 }],
    );
    const r = simulateDisruption(lonely, [strike('B')], 'A', 'C');
    assert.equal(r.status, 'baseline_unavailable');
    assert.match(r.explanation, /even before the disruption/);
  });

  it('with no effects it reports unaffected, and the shared graph still routes as before ("restore")', () => {
    const r = simulateDisruption(g, [], 'S', 'T', 'fastest');
    assert.equal(r.status, 'unaffected');
    assert.deepEqual(findRoute(g, 'S', 'T', 'fastest').path, ['S', 'X', 'T']);
  });

  it('throws for bad input instead of returning a misleading result', () => {
    assert.throws(() => simulateDisruption(g, [strike('X')], 'NOPE', 'T'), RoutingInputError);
    assert.throws(() => simulateDisruption(g, [strike('NOPE')], 'S', 'T'), RoutingInputError);
    assert.throws(
      () => simulateDisruption(g, [strike('X')], 'S', 'T', 'shortest'),
      RoutingInputError,
    );
  });
});

describe('simulateDisruption: explanations', () => {
  const g = threeRouteGraph();

  it('names the closed port, the disruption type, the routes and the impact', () => {
    const r = simulateDisruption(g, [strike('X')], 'S', 'T', 'fastest');
    assert.match(r.explanation, /X \(port strike\)/);
    assert.match(r.explanation, /fastest route from S to T/);
    assert.match(r.explanation, /S > X > T/);
    assert.match(r.explanation, /S > Y > T/);
    assert.match(r.explanation, /30 more days/);
    assert.match(r.explanation, /\$5,000 less/);
  });

  it('describes a closed lane by the port names', () => {
    const r = simulateDisruption(g, [{ type: 'severe_weather', from: 'X', to: 'T' }], 'S', 'T');
    assert.match(r.explanation, /^The lane X to T \(severe weather\) lies on the/);
  });

  it('adds an "illustrative" note only when the data is labeled illustrative', () => {
    assert.doesNotMatch(simulateDisruption(g, [strike('X')], 'S', 'T').explanation, /illustrative/);
    const labeled = buildGraph([...g.ports.values()], g.edges, { dataLabel: 'illustrative' });
    assert.match(simulateDisruption(labeled, [strike('X')], 'S', 'T').explanation, /illustrative/);
  });

  it('never uses accusatory wording', () => {
    for (const effects of [
      [strike('X')],
      [strike('Z')],
      [strike('S')],
      [strike('X'), strike('Y'), strike('Z')],
    ]) {
      assert.doesNotMatch(simulateDisruption(g, effects, 'S', 'T').explanation, /fraud/i);
    }
  });
});
