import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CHOKEPOINTS, chokepointsOnPath } from '../src/lib/chokepoints.js';
import { routeToGeoJSON } from '../src/lib/mapData.js';

const port = (code, lon, lat) => ({ code, lon, lat });
const SHA = port('CNSHA', 121.47, 31.23);
const SGN = port('SGSIN', 103.82, 1.26);
const KHI = port('PKKHI', 66.98, 24.84);
const RTM = port('NLRTM', 4.14, 51.95);
const VLC = port('ESVLC', -0.32, 39.45);
const PIR = port('GRPIR', 23.64, 37.94);
const PSD = port('EGPSD', 32.3, 31.26);
const JED = port('SAJED', 39.17, 21.48);
const JIB = port('DJJIB', 43.15, 11.59);
const SLL = port('OMSLL', 54.0, 16.94);

const namesOn = (stops) =>
  chokepointsOnPath(routeToGeoJSON(stops).geometry.coordinates).map((c) => c.name);

describe('CHOKEPOINTS', () => {
  it('lists the major passages with a name, position and note', () => {
    const names = CHOKEPOINTS.map((c) => c.name);
    for (const n of [
      'Strait of Malacca',
      'Strait of Hormuz',
      'Bab-el-Mandeb',
      'Suez Canal',
      'Strait of Gibraltar',
      'Cape of Good Hope',
      'Taiwan Strait',
      'Panama Canal',
    ])
      assert.ok(names.includes(n), n);
    for (const c of CHOKEPOINTS) {
      assert.ok(c.note.length > 10 && c.radiusKm > 0);
      assert.ok(Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180);
    }
    assert.equal(new Set(CHOKEPOINTS.map((c) => c.id)).size, CHOKEPOINTS.length);
  });
  it('marks Panama as not used by the seeded network', () => {
    assert.equal(CHOKEPOINTS.find((c) => c.id === 'panama').usedBySeed, false);
    assert.equal(CHOKEPOINTS.find((c) => c.id === 'suez').usedBySeed, true);
  });
});

describe('chokepointsOnPath', () => {
  it('finds Malacca on Shanghai to Singapore to Karachi', () => {
    const names = namesOn([SHA, SGN, KHI]);
    assert.ok(names.includes('Strait of Malacca'));
    assert.ok(!names.includes('Suez Canal'));
  });
  it('finds Gibraltar, Suez and Bab-el-Mandeb on Rotterdam to Karachi via Port Said', () => {
    const names = namesOn([RTM, VLC, PIR, PSD, JED, JIB, SLL, KHI]);
    for (const n of ['Strait of Gibraltar', 'Suez Canal', 'Bab-el-Mandeb'])
      assert.ok(names.includes(n), n);
    assert.ok(!names.includes('Strait of Malacca'));
    assert.ok(!names.includes('Panama Canal'));
  });
  it('lists them in the order the path reaches them', () => {
    const names = namesOn([RTM, VLC, PIR, PSD, JED, JIB]);
    assert.ok(names.indexOf('Strait of Gibraltar') < names.indexOf('Suez Canal'));
    assert.ok(names.indexOf('Suez Canal') < names.indexOf('Bab-el-Mandeb'));
  });
  it('finds the Cape of Good Hope on Colombo to Cape Town', () => {
    const names = namesOn([port('LKCMB', 79.85, 6.94), port('ZACPT', 18.43, -33.92)]);
    assert.ok(names.includes('Cape of Good Hope'));
  });
  it('works on sparse paths and handles empty input', () => {
    assert.deepEqual(
      chokepointsOnPath([
        [-8, 36],
        [-3, 36],
      ]).map((c) => c.id),
      ['gibraltar'],
    );
    assert.deepEqual(chokepointsOnPath([]), []);
    assert.deepEqual(chokepointsOnPath(undefined), []);
  });
  it('treats unwrapped longitudes like normal ones', () => {
    const hits = chokepointsOnPath([
      [-79.7 + 360, 9.1],
      [-79.7 + 360, 9.2],
    ]);
    assert.deepEqual(
      hits.map((c) => c.id),
      ['panama'],
    );
  });
});
