import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RoutingInputError, applyDisruptions, buildGraph, findRoute } from '../src/index.js';
import { threeRouteGraph } from './helpers/fixtures.js';

const rejects = (effects, pattern) =>
  assert.throws(
    () => applyDisruptions(threeRouteGraph(), effects),
    (err) => err instanceof RoutingInputError && pattern.test(err.message),
  );

// A plain-data snapshot of a graph, used to prove nothing changed.
const snapshot = (g) =>
  JSON.stringify({
    ports: [...g.ports.values()],
    edges: g.edges,
    maxima: g.maxima,
    label: g.dataLabel,
  });

describe('applyDisruptions: closing things', () => {
  it('closing a port removes it and every lane touching it', () => {
    const { graph, closedPorts } = applyDisruptions(threeRouteGraph(), [
      { type: 'port_strike', portCode: 'X' },
    ]);
    assert.deepEqual(closedPorts, ['X']);
    assert.equal(graph.ports.has('X'), false);
    assert.equal(graph.ports.size, 4);
    assert.equal(graph.edges.length, 4); // S-X and X-T are gone
    assert.ok(graph.edges.every((e) => e.from !== 'X' && e.to !== 'X'));
  });

  it('closing a lane removes only that direction', () => {
    const original = threeRouteGraph();
    const { graph, closedLanes } = applyDisruptions(original, [
      { type: 'connection_failure', from: 'S', to: 'X' },
    ]);
    assert.deepEqual(closedLanes, [{ from: 'S', to: 'X' }]);
    assert.equal(graph.edges.length, original.edges.length - 1);
    assert.equal(
      graph.adjacency.get('S').some((e) => e.to === 'X'),
      false,
    );
    assert.equal(graph.ports.size, 5); // no port is closed
  });

  it('several effects combine', () => {
    const { graph } = applyDisruptions(threeRouteGraph(), [
      { type: 'port_congestion', portCode: 'X' },
      { type: 'severe_weather', portCode: 'Y' },
      { type: 'severe_weather', from: 'S', to: 'Z' },
    ]);
    assert.equal(findRoute(graph, 'S', 'T').status, 'no_route');
  });

  it('closing the same thing twice is harmless', () => {
    const effect = { type: 'port_strike', portCode: 'X' };
    const { graph, closedPorts } = applyDisruptions(threeRouteGraph(), [effect, effect]);
    assert.deepEqual(closedPorts, ['X']);
    assert.equal(graph.ports.size, 4);
  });

  it('no effects gives an equivalent graph (the "restore" case)', () => {
    const original = threeRouteGraph();
    const { graph } = applyDisruptions(original, []);
    assert.equal(snapshot(graph), snapshot(original));
    assert.deepEqual(findRoute(graph, 'S', 'T').path, findRoute(original, 'S', 'T').path);
  });

  it('keeps the data label and edge ids', () => {
    const g = buildGraph(
      [
        { code: 'A', lat: 0, lon: 0 },
        { code: 'B', lat: 0, lon: 5 },
        { code: 'C', lat: 0, lon: 9 },
      ],
      [
        {
          id: 'e1',
          from: 'A',
          to: 'B',
          distanceKm: 900,
          transitDays: 2,
          freightCostUsd: 10,
          riskScore: 0.1,
        },
        {
          id: 'e2',
          from: 'B',
          to: 'C',
          distanceKm: 900,
          transitDays: 2,
          freightCostUsd: 10,
          riskScore: 0.1,
        },
      ],
      { dataLabel: 'illustrative' },
    );
    const { graph } = applyDisruptions(g, [{ type: 'port_strike', portCode: 'C' }]);
    assert.equal(graph.dataLabel, 'illustrative');
    assert.deepEqual(
      graph.edges.map((e) => e.id),
      ['e1'],
    );
  });
});

describe('applyDisruptions: the shared graph is never changed', () => {
  it('leaves the input graph exactly as it was, and it still routes through the closed port', () => {
    const original = threeRouteGraph();
    const before = snapshot(original);
    applyDisruptions(original, [
      { type: 'port_strike', portCode: 'X' },
      { type: 'connection_failure', from: 'S', to: 'Y' },
    ]);
    assert.equal(snapshot(original), before);
    assert.equal(original.ports.has('X'), true);
    assert.deepEqual(findRoute(original, 'S', 'T', 'fastest').path, ['S', 'X', 'T']);
  });

  it('lets two users simulate different crises from the same graph at the same time', () => {
    const shared = threeRouteGraph();
    const alice = applyDisruptions(shared, [{ type: 'port_strike', portCode: 'X' }]).graph;
    const bob = applyDisruptions(shared, [{ type: 'port_strike', portCode: 'Y' }]).graph;
    assert.equal(alice.ports.has('X'), false);
    assert.equal(alice.ports.has('Y'), true);
    assert.equal(bob.ports.has('Y'), false);
    assert.equal(bob.ports.has('X'), true);
    assert.deepEqual(findRoute(bob, 'S', 'T', 'fastest').path, ['S', 'X', 'T']);
    assert.deepEqual(findRoute(alice, 'S', 'T', 'cheapest').path, ['S', 'Y', 'T']);
    assert.deepEqual(findRoute(shared, 'S', 'T', 'fastest').path, ['S', 'X', 'T']);
  });
});

describe('applyDisruptions: validation', () => {
  it('rejects non-array input', () => {
    assert.throws(() => applyDisruptions(threeRouteGraph(), 'X'), RoutingInputError);
  });

  it('rejects unknown types, ports and lanes instead of silently ignoring them', () => {
    rejects([{ type: 'earthquake', portCode: 'X' }], /unknown type "earthquake"/);
    rejects([{ type: 'port_strike', portCode: 'NOPE' }], /unknown port "NOPE"/);
    rejects([{ type: 'connection_failure', from: 'S', to: 'T' }], /no lane S -> T/);
    rejects([null], /unknown type/);
  });

  it('rejects an effect that closes both or neither of port and lane', () => {
    rejects([{ type: 'severe_weather' }], /either portCode, or both from and to/);
    rejects(
      [{ type: 'severe_weather', portCode: 'X', from: 'S', to: 'X' }],
      /either portCode, or both from and to/,
    );
    rejects([{ type: 'severe_weather', from: 'S' }], /needs both from and to|no lane/);
  });

  it('rejects mismatches between the type and what it closes', () => {
    rejects([{ type: 'port_strike', from: 'S', to: 'X' }], /applies to a port/);
    rejects([{ type: 'port_congestion', from: 'S', to: 'X' }], /applies to a port/);
    rejects([{ type: 'connection_failure', portCode: 'X' }], /applies to a lane/);
  });

  it('allows severe weather on either a port or a lane', () => {
    assert.doesNotThrow(() =>
      applyDisruptions(threeRouteGraph(), [{ type: 'severe_weather', portCode: 'X' }]),
    );
    assert.doesNotThrow(() =>
      applyDisruptions(threeRouteGraph(), [{ type: 'severe_weather', from: 'S', to: 'X' }]),
    );
  });

  it('reports which effect is wrong', () => {
    rejects(
      [
        { type: 'port_strike', portCode: 'X' },
        { type: 'port_strike', portCode: 'NOPE' },
      ],
      /Effect 2/,
    );
  });
});
