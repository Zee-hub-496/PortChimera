import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, simulateDisruption } from '../../packages/core/src/index.js';
import { buildSeed } from '../routing-seed/definition.mjs';

// These tests run the overlay on the real illustrative seed network, so they protect the
// demo story: if someone edits the seed and breaks it, a test fails.
const seed = buildSeed();
const graph = buildGraph(seed.ports, seed.edges, { dataLabel: 'illustrative' });

const portEffect = (type, portCode) => ({ type, portCode });
const laneEffect = (type, from, to) => ({ type, from, to });
const simulate = (effects, from, to, objective = 'fastest') =>
  simulateDisruption(graph, effects, from, to, objective);

describe('crisis scenarios on the seed network', () => {
  it('Singapore port strike: Shanghai to Karachi moves via Port Klang and Colombo', () => {
    const r = simulate([portEffect('port_strike', 'SGSIN')], 'CNSHA', 'PKKHI');
    assert.equal(r.status, 'rerouted');
    assert.deepEqual(r.baseline.path, ['CNSHA', 'SGSIN', 'PKKHI']);
    assert.deepEqual(r.disrupted.path, ['CNSHA', 'MYPKG', 'LKCMB', 'PKKHI']);
    assert.equal(r.added.days, 2.6);
    assert.equal(r.added.costUsd, 207);
    assert.deepEqual(r.changedPorts, { dropped: ['SGSIN'], added: ['MYPKG', 'LKCMB'] });
    assert.match(r.explanation, /^Singapore \(port strike\) lies on the fastest route/);
    assert.match(r.explanation, /2\.6 more days/);
    assert.match(r.explanation, /\$207 more/);
    assert.match(r.explanation, /illustrative/);
  });

  it('the strike never changes the shared graph, and the same question gives the same answer again', () => {
    const first = simulate([portEffect('port_strike', 'SGSIN')], 'CNSHA', 'PKKHI');
    assert.equal(graph.ports.has('SGSIN'), true);
    const second = simulate([portEffect('port_strike', 'SGSIN')], 'CNSHA', 'PKKHI');
    assert.deepEqual(second.disrupted.path, first.disrupted.path);
    assert.deepEqual(simulate([], 'CNSHA', 'PKKHI').disrupted.path, ['CNSHA', 'SGSIN', 'PKKHI']);
  });

  it('a failed lane out of Shanghai reroutes via Hong Kong and still uses Singapore', () => {
    const r = simulate([laneEffect('connection_failure', 'CNSHA', 'SGSIN')], 'CNSHA', 'PKKHI');
    assert.equal(r.status, 'rerouted');
    assert.deepEqual(r.disrupted.path, ['CNSHA', 'HKHKG', 'SGSIN', 'PKKHI']);
    assert.match(r.explanation, /^The lane Shanghai to Singapore \(connection failure\)/);
  });

  it('congestion at Colombo affects the cheapest route but not the fastest', () => {
    const effects = [portEffect('port_congestion', 'LKCMB')];
    assert.equal(simulate(effects, 'CNSHA', 'PKKHI', 'fastest').status, 'unaffected');
    assert.equal(simulate(effects, 'CNSHA', 'PKKHI', 'cheapest').status, 'rerouted');
  });

  it('a Suez closure sends Rotterdam to Karachi around Africa', () => {
    const r = simulate([portEffect('port_strike', 'EGPSD')], 'NLRTM', 'PKKHI');
    assert.equal(r.status, 'rerouted');
    assert.ok(r.baseline.path.includes('EGPSD'));
    assert.deepEqual(r.disrupted.path, ['NLRTM', 'ZACPT', 'LKCMB', 'PKKHI']);
    assert.ok(r.added.days > 5);
    assert.ok(r.added.costUsd > 1000);
  });

  it('a closed destination gives a clear failure, not an error', () => {
    const r = simulate([portEffect('severe_weather', 'PKKHI')], 'CNSHA', 'PKKHI');
    assert.equal(r.status, 'destination_closed');
    assert.match(
      r.explanation,
      /^No valid route exists\. The destination port is closed: Karachi \(severe weather\)/,
    );
  });

  it('a closed origin gives a clear failure', () => {
    assert.equal(
      simulate([portEffect('port_strike', 'CNSHA')], 'CNSHA', 'PKKHI').status,
      'origin_closed',
    );
  });

  it('closing every lane into Karachi leaves no alternative', () => {
    const intoKarachi = seed.edges
      .filter((e) => e.to === 'PKKHI')
      .map((e) => laneEffect('connection_failure', e.from, 'PKKHI'));
    assert.ok(intoKarachi.length >= 4);
    const r = simulate(intoKarachi, 'CNSHA', 'PKKHI');
    assert.equal(r.status, 'no_route');
    assert.match(r.explanation, /no alternative route exists/);
  });

  it('a disruption far from the route changes nothing', () => {
    const r = simulate([portEffect('port_strike', 'USLAX')], 'CNSHA', 'PKKHI');
    assert.equal(r.status, 'unaffected');
    assert.deepEqual(r.added, { days: 0, costUsd: 0, risk: 0 });
  });

  it('two users can run different crises at once without affecting each other', () => {
    const alice = simulate([portEffect('port_strike', 'SGSIN')], 'CNSHA', 'PKKHI');
    const bob = simulate([portEffect('port_strike', 'MYPKG')], 'CNSHA', 'PKKHI');
    assert.equal(alice.status, 'rerouted');
    assert.equal(bob.status, 'unaffected');
  });
});
