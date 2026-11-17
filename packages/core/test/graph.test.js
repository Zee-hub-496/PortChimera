import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, RoutingInputError } from '../src/index.js';

const ports = [
  { code: 'AAA', lat: 0, lon: 0 },
  { code: 'BBB', lat: 0, lon: 10 }, // about 1,112 km east of AAA
  { code: 'CCC', lat: 10, lon: 10 },
];

const edge = (overrides = {}) => ({
  from: 'AAA',
  to: 'BBB',
  distanceKm: 1500,
  transitDays: 5,
  freightCostUsd: 1000,
  riskScore: 0.2,
  ...overrides,
});

const rejects = (portList, edgeList, pattern) =>
  assert.throws(
    () => buildGraph(portList, edgeList),
    (err) => err instanceof RoutingInputError && pattern.test(err.message),
  );

describe('buildGraph', () => {
  it('builds a graph with adjacency, maxima and the data label', () => {
    const g = buildGraph(
      ports,
      [
        edge(),
        edge({
          from: 'BBB',
          to: 'CCC',
          distanceKm: 1500,
          transitDays: 9,
          freightCostUsd: 400,
          riskScore: 0.7,
        }),
      ],
      { dataLabel: 'illustrative' },
    );
    assert.equal(g.ports.size, 3);
    assert.equal(g.edges.length, 2);
    assert.equal(g.adjacency.get('AAA').length, 1);
    assert.equal(g.adjacency.get('CCC').length, 0);
    assert.deepEqual({ ...g.maxima }, { transitDays: 9, freightCostUsd: 1000, riskScore: 0.7 });
    assert.equal(g.dataLabel, 'illustrative');
  });

  it('sorts neighbours by destination code so input order does not matter', () => {
    const e1 = edge({ to: 'CCC', distanceKm: 3000 });
    const e2 = edge({ to: 'BBB' });
    const g1 = buildGraph(ports, [e1, e2]);
    const g2 = buildGraph(ports, [e2, e1]);
    assert.deepEqual(
      g1.adjacency.get('AAA').map((e) => e.to),
      ['BBB', 'CCC'],
    );
    assert.deepEqual(
      g2.adjacency.get('AAA').map((e) => e.to),
      ['BBB', 'CCC'],
    );
  });

  it('keeps an optional edge id', () => {
    const g = buildGraph(ports, [edge({ id: 'edge-1' })]);
    assert.equal(g.edges[0].id, 'edge-1');
  });

  it('does not let callers change the stored edges', () => {
    const g = buildGraph(ports, [edge()]);
    assert.throws(() => {
      'use strict';
      g.edges[0].transitDays = 1;
    }, TypeError);
  });

  it('accepts a lane longer than the straight line', () => {
    assert.doesNotThrow(() => buildGraph(ports, [edge({ distanceKm: 5000 })]));
  });

  it('rejects a lane shorter than the straight-line distance (heuristic safety)', () => {
    rejects(ports, [edge({ distanceKm: 800 })], /shorter than the straight-line distance/);
  });

  it('rejects duplicate port codes and bad coordinates', () => {
    rejects([...ports, { code: 'AAA', lat: 1, lon: 1 }], [], /Duplicate port code/);
    rejects([{ code: 'XXX', lat: 95, lon: 0 }], [], /invalid coordinates/);
    rejects([{ code: '', lat: 0, lon: 0 }], [], /non-empty string code/);
  });

  it('rejects unknown ports, self loops and duplicate edges', () => {
    rejects(ports, [edge({ to: 'ZZZ' })], /unknown destination port/);
    rejects(ports, [edge({ from: 'ZZZ' })], /unknown origin port/);
    rejects(ports, [edge({ to: 'AAA' })], /cannot connect to itself/);
    rejects(ports, [edge(), edge()], /Duplicate edge/);
  });

  it('allows the opposite direction as a separate edge', () => {
    const g = buildGraph(ports, [edge(), edge({ from: 'BBB', to: 'AAA' })]);
    assert.equal(g.edges.length, 2);
  });

  it('rejects invalid numeric attributes', () => {
    rejects(ports, [edge({ distanceKm: 0 })], /distanceKm must be a positive number/);
    rejects(ports, [edge({ transitDays: -1 })], /transitDays must be a positive number/);
    rejects(ports, [edge({ freightCostUsd: -5 })], /freightCostUsd must be zero or more/);
    rejects(ports, [edge({ riskScore: 1.5 })], /riskScore must be between 0 and 1/);
    rejects(ports, [edge({ transitDays: NaN })], /transitDays/);
    rejects(ports, [edge({ freightCostUsd: '100' })], /freightCostUsd/);
  });

  it('rejects non-array input', () => {
    assert.throws(() => buildGraph(null, []), RoutingInputError);
  });
});
