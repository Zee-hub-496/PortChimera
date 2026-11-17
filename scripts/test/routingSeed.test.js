import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGraph, findRoute } from '../../packages/core/src/index.js';
import { buildSeed, buildSql } from '../routing-seed/definition.mjs';

const readSeedFile = (name) =>
  readFileSync(new URL(`../../supabase/seed/${name}`, import.meta.url), 'utf8');

const seed = buildSeed();
const graph = buildGraph(seed.ports, seed.edges, { dataLabel: 'illustrative' });

// Stand-in for the disruption overlay (spec 06): remove a port and every lane touching it.
const withoutPort = (code) =>
  buildGraph(
    seed.ports.filter((p) => p.code !== code),
    seed.edges.filter((e) => e.from !== code && e.to !== code),
  );

const route = (g, from, to, objective) =>
  findRoute(g, from, to, objective, { scale: graph.maxima });

describe('routing seed: files', () => {
  it('generated files are in sync with the definition (run `npm run seed:generate` if this fails)', () => {
    assert.deepEqual(JSON.parse(readSeedFile('ports.json')), seed.ports);
    assert.deepEqual(JSON.parse(readSeedFile('edges.json')), seed.edges);
    assert.equal(readSeedFile('routing_seed.sql'), buildSql(seed));
  });

  it('SQL has one row per port and per directed lane and says it is illustrative', () => {
    const sql = readSeedFile('routing_seed.sql');
    const rows = sql.split('\n').filter((line) => /^ {2}\('/.test(line));
    assert.equal(rows.length, seed.ports.length + seed.edges.length);
    assert.match(sql, /NOT real quotes/);
    assert.match(sql, /not yet run/);
  });
});

describe('routing seed: data quality', () => {
  it('has about 20 ports and every record is labeled illustrative', () => {
    assert.equal(seed.ports.length, 20);
    assert.ok(seed.ports.every((p) => p.dataLabel === 'illustrative'));
    assert.ok(seed.edges.every((e) => e.dataLabel === 'illustrative'));
    assert.equal(graph.dataLabel, 'illustrative');
  });

  it('passes graph validation: no lane is shorter than the straight line (heuristic safety)', () => {
    assert.doesNotThrow(() => buildGraph(seed.ports, seed.edges));
  });

  it('every lane exists in both directions with identical attributes', () => {
    const key = (e) => `${e.from}>${e.to}`;
    const byKey = new Map(seed.edges.map((e) => [key(e), e]));
    for (const e of seed.edges) {
      const back = byKey.get(`${e.to}>${e.from}`);
      assert.ok(back, `${key(e)} has no reverse lane`);
      for (const field of ['distanceKm', 'transitDays', 'freightCostUsd', 'riskScore']) {
        assert.equal(back[field], e[field], `${key(e)} ${field}`);
      }
    }
  });

  it('every port can reach every other port', () => {
    for (const from of graph.ports.keys()) {
      for (const to of graph.ports.keys()) {
        assert.equal(route(graph, from, to, 'fastest').status, 'found', `${from} -> ${to}`);
      }
    }
  });

  it('has plausible speeds: no lane implies faster than about 1,100 km per day', () => {
    for (const e of seed.edges) {
      assert.ok(e.distanceKm / e.transitDays < 1100, `${e.from}>${e.to} is too fast`);
    }
  });
});

describe('routing seed: the demo story (Shanghai to Karachi)', () => {
  const baseline = route(graph, 'CNSHA', 'PKKHI', 'fastest');
  const struck = route(withoutPort('SGSIN'), 'CNSHA', 'PKKHI', 'fastest');

  it('the fastest baseline route goes through Singapore', () => {
    assert.deepEqual(baseline.path, ['CNSHA', 'SGSIN', 'PKKHI']);
  });

  it('with Singapore closed the route moves through Port Klang and Colombo', () => {
    assert.equal(struck.status, 'found');
    assert.deepEqual(struck.path, ['CNSHA', 'MYPKG', 'LKCMB', 'PKKHI']);
  });

  it('the alternative is slower and costlier, so the disruption has a visible impact', () => {
    assert.ok(struck.totals.transitDays - baseline.totals.transitDays >= 2);
    assert.ok(struck.totals.freightCostUsd - baseline.totals.freightCostUsd >= 100);
  });

  it('the three objectives do not all choose the same route', () => {
    const fastest = route(graph, 'CNSHA', 'PKKHI', 'fastest');
    const cheapest = route(graph, 'CNSHA', 'PKKHI', 'cheapest');
    const safest = route(graph, 'CNSHA', 'PKKHI', 'lowest_risk');
    assert.ok(cheapest.totals.freightCostUsd < fastest.totals.freightCostUsd);
    assert.ok(fastest.totals.transitDays < cheapest.totals.transitDays);
    assert.ok(safest.totals.riskSum < fastest.totals.riskSum);
  });

  it('closing Karachi itself leaves no route to it', () => {
    assert.throws(
      () => route(withoutPort('PKKHI'), 'CNSHA', 'PKKHI', 'fastest'),
      /destination port/,
    );
  });
});

describe('routing seed: a second scenario for the dashboard (Suez corridor)', () => {
  it('closing Port Said sends Rotterdam to Karachi around Africa', () => {
    const before = route(graph, 'NLRTM', 'PKKHI', 'fastest');
    const after = route(withoutPort('EGPSD'), 'NLRTM', 'PKKHI', 'fastest');
    assert.ok(before.path.includes('EGPSD'));
    assert.ok(after.path.includes('ZACPT'));
    assert.ok(after.totals.transitDays > before.totals.transitDays);
  });
});
