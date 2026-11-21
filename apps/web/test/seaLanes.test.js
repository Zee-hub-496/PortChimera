import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LANES, PORTS } from '../../../scripts/routing-seed/definition.mjs';
import { SEA_LANES, seaLaneWaypoints, seaLanePath, hasSeaLane } from '../src/lib/seaLanes.js';
import { densify, distanceKm } from '../src/lib/geo.js';
import { loadWorld, makeIsLand } from './helpers/land.js';

const portByCode = new Map(
  PORTS.map(([code, name, , lat, lon]) => [code, { code, name, lon, lat }]),
);
const at = (code) => [portByCode.get(code).lon, portByCode.get(code).lat];

const SAMPLE_KM = 25;
// The 110m polygons are coarse, so ports and narrow passages get a small allowance.
const PORT_RADIUS_KM = 60;
const PASSAGES = [
  { name: 'Gulf of Suez head', point: [32.55, 29.95], radiusKm: 60 },
  { name: 'Suez Canal', point: [32.4, 30.4], radiusKm: 60 },
  { name: 'Bab-el-Mandeb', point: [43.4, 12.6], radiusKm: 40 },
  { name: 'Strait of Hormuz', point: [56.5, 26.5], radiusKm: 40 },
  { name: 'Strait of Gibraltar', point: [-5.6, 36.0], radiusKm: 40 },
  { name: 'Strait of Dover', point: [1.6, 51.0], radiusKm: 40 },
];

const isLand = makeIsLand(loadWorld());

function exempt(p) {
  for (const code of portByCode.keys()) if (distanceKm(p, at(code)) <= PORT_RADIUS_KM) return true;
  return PASSAGES.some((s) => distanceKm(p, s.point) <= s.radiusKm);
}

function landSamples(path) {
  return densify(path, SAMPLE_KM)
    .filter((p) => !exempt(p) && isLand(p))
    .map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)} (${isLand(p)})`);
}

describe('sea lane coverage', () => {
  it('has an entry for every seeded lane', () => {
    assert.equal(LANES.length, 30);
    for (const [a, b] of LANES) assert.ok(hasSeaLane(a, b), `${a}-${b} has no sea lane`);
  });
  it('has no entry for a pair that is not a seeded lane', () => {
    const keys = new Set(LANES.flatMap(([a, b]) => [`${a}-${b}`, `${b}-${a}`]));
    for (const key of Object.keys(SEA_LANES)) assert.ok(keys.has(key), `${key} is not a lane`);
    assert.equal(Object.keys(SEA_LANES).length, LANES.length);
  });
  it('returns null for an unknown pair', () =>
    assert.equal(seaLaneWaypoints('CNSHA', 'ZACPT'), null));
});

describe('sea lane paths', () => {
  it('start and end at the port coordinates', () => {
    for (const [a, b] of LANES) {
      const path = seaLanePath(a, b, at(a), at(b));
      assert.deepEqual(path[0], at(a), `${a}-${b} start`);
      assert.deepEqual(path[path.length - 1], at(b), `${a}-${b} end`);
    }
  });
  it('reverse lanes are the reversed path', () => {
    for (const [a, b] of LANES) {
      const fwd = seaLanePath(a, b, at(a), at(b));
      const back = seaLanePath(b, a, at(b), at(a));
      assert.deepEqual(
        back.map((p) => p.map((n) => +n.toFixed(6))),
        [...fwd].reverse().map((p) => p.map((n) => +n.toFixed(6))),
        `${a}-${b}`,
      );
    }
  });
  it('keeps pieces short enough to draw smoothly', () => {
    for (const [a, b] of LANES) {
      const path = seaLanePath(a, b, at(a), at(b));
      for (let i = 1; i < path.length; i++) {
        assert.ok(distanceKm(path[i - 1], path[i]) <= 121, `${a}-${b} piece ${i}`);
      }
    }
  });
  it('never puts a sample on land, except near ports and canals', () => {
    const problems = [];
    for (const [a, b] of LANES) {
      const bad = landSamples(seaLanePath(a, b, at(a), at(b)));
      if (bad.length) problems.push(`${a}-${b}: ${bad.length} samples on land, first ${bad[0]}`);
    }
    assert.deepEqual(problems, []);
  });
  it('detects land (the old great-circle Singapore to Karachi arc crosses India)', () => {
    const arc = densify([at('SGSIN'), at('PKKHI')], 60);
    assert.ok(arc.some((p) => !exempt(p) && isLand(p)));
  });
});
