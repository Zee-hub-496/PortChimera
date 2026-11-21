import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { WORLD_URL, loadWorld, makeIsLand } from './helpers/land.js';
import { buildWorld } from '../../../scripts/build-world-geojson.mjs';

const MAX_BYTES = 300 * 1024;

describe('world basemap asset', () => {
  const world = loadWorld();
  it('stays small', () => assert.ok(statSync(WORLD_URL).size < MAX_BYTES));
  it('contains no URL, so no tile service or remote data', () => {
    const text = readFileSync(WORLD_URL, 'utf8');
    assert.doesNotMatch(text, /https?:|cartocdn|\{z\}|tile/i);
  });
  it('keeps only a name and a multipolygon per country', () => {
    assert.ok(world.features.length > 150);
    for (const f of world.features) {
      assert.deepEqual(Object.keys(f.properties), ['name']);
      assert.equal(f.geometry.type, 'MultiPolygon');
    }
    assert.ok(!world.features.some((f) => f.properties.name === 'Antarctica'));
  });
  it('has sensible land and sea', () => {
    const isLand = makeIsLand(world);
    assert.ok(isLand([2.35, 48.85]), 'Paris is land');
    assert.ok(isLand([78, 22]), 'central India is land');
    assert.ok(!isLand([-40, 30]), 'mid Atlantic is sea');
    assert.ok(!isLand([80.6, 5.3]), 'south of Sri Lanka is sea');
  });
});

describe('buildWorld', () => {
  const ring = [
    [0.001, 0.004],
    [0.002, 0.004],
    [1.234, 0.5],
    [1.0, 2.0],
    [0.001, 0.004],
  ];
  it('rounds to 2 decimals, drops repeated points and Antarctica', () => {
    const out = buildWorld({
      features: [
        {
          properties: { NAME: 'Testland', X: 1 },
          geometry: { type: 'Polygon', coordinates: [ring] },
        },
        { properties: { NAME: 'Antarctica' }, geometry: { type: 'Polygon', coordinates: [ring] } },
      ],
    });
    assert.equal(out.features.length, 1);
    assert.deepEqual(out.features[0].properties, { name: 'Testland' });
    assert.deepEqual(out.features[0].geometry.coordinates[0][0], [
      [0, 0],
      [1.23, 0.5],
      [1, 2],
      [0, 0],
    ]);
  });
});
