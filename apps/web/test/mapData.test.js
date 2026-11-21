import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  greatCirclePoints,
  unwrapLongitudes,
  routeToGeoJSON,
  portsToGeoJSON,
  boundsOf,
  routesToGeoJSON,
  disruptedToGeoJSON,
  progressiveLine,
  ROUTE_TONES,
  CARTO_TILES,
  TILE_SUBDOMAINS,
  toLatLngs,
  styleFor,
  MAP_ATTRIBUTION,
  ILLUSTRATIVE_ROUTE_NOTE,
} from '../src/lib/mapData.js';

const SHA = [121.47, 31.23];
const LAX = [-118.27, 33.73];
const KHI = [66.98, 24.84];

function maxJump(points) {
  let m = 0;
  for (let i = 1; i < points.length; i++)
    m = Math.max(m, Math.abs(points[i][0] - points[i - 1][0]));
  return m;
}

describe('greatCirclePoints', () => {
  it('keeps both endpoints and the segment count', () => {
    const pts = greatCirclePoints(SHA, KHI, 10);
    assert.equal(pts.length, 11);
    assert.deepEqual(pts[0], SHA);
    assert.deepEqual(pts[10], KHI);
  });
  it('handles identical points', () => {
    assert.equal(greatCirclePoints(SHA, SHA).length, 2);
  });
});

describe('unwrapLongitudes', () => {
  it('removes the jump across the antimeridian', () => {
    const raw = greatCirclePoints(SHA, LAX, 64);
    assert.ok(maxJump(raw) > 180);
    const fixed = unwrapLongitudes(raw);
    assert.ok(maxJump(fixed) <= 180);
    assert.deepEqual(fixed[0], raw[0]);
  });
  it('leaves a normal route alone', () => {
    const raw = greatCirclePoints(SHA, KHI, 20);
    assert.deepEqual(unwrapLongitudes(raw), raw);
  });
});

describe('GeoJSON builders', () => {
  const stops = [
    { code: 'CNSHA', name: 'Shanghai', lon: SHA[0], lat: SHA[1] },
    { code: 'PKKHI', name: 'Karachi', lon: KHI[0], lat: KHI[1] },
  ];
  it('builds a LineString that starts and ends at the stops', () => {
    const f = routeToGeoJSON(stops, { id: 1 });
    assert.equal(f.geometry.type, 'LineString');
    const c = f.geometry.coordinates;
    assert.deepEqual(c[0], SHA);
    assert.deepEqual(c[c.length - 1], KHI);
    assert.equal(f.properties.id, 1);
  });
  it('joins several legs without duplicating the shared stop', () => {
    const three = [...stops, { lon: 4.14, lat: 51.95 }];
    const c = routeToGeoJSON(three).geometry.coordinates;
    assert.equal(c.length, 64 + 64 + 1);
  });
  it('builds a port collection with highlight flags', () => {
    const fc = portsToGeoJSON(stops, { highlightCodes: ['PKKHI'] });
    assert.equal(fc.type, 'FeatureCollection');
    assert.equal(fc.features.length, 2);
    assert.deepEqual(fc.features[1].geometry.coordinates, KHI);
    assert.equal(fc.features[1].properties.highlight, true);
    assert.equal(fc.features[0].properties.highlight, false);
  });
});

describe('boundsOf', () => {
  it('contains every point, including unwrapped ones', () => {
    const pts = unwrapLongitudes(greatCirclePoints(SHA, LAX, 40));
    const [[w, s], [e, n]] = boundsOf(pts);
    for (const [lon, lat] of pts) {
      assert.ok(lon >= w && lon <= e && lat >= s && lat <= n);
    }
  });
  it('returns null for no points', () => assert.equal(boundsOf([]), null));
});

describe('styles', () => {
  it('picks the tile template by theme', () => {
    assert.equal(styleFor('dark'), CARTO_TILES.dark);
    assert.equal(styleFor('light'), CARTO_TILES.light);
    assert.notEqual(CARTO_TILES.dark, CARTO_TILES.light);
    assert.match(CARTO_TILES.light, /light_all\/\{z\}\/\{x\}\/\{y\}\{r\}\.png$/);
    assert.match(CARTO_TILES.dark, /dark_all\/\{z\}\/\{x\}\/\{y\}\{r\}\.png$/);
    assert.equal(TILE_SUBDOMAINS, 'abcd');
  });
  it('converts [lon, lat] to [lat, lng]', () => {
    assert.deepEqual(
      toLatLngs([
        [10, 20],
        [-5, 7],
      ]),
      [
        [20, 10],
        [7, -5],
      ],
    );
  });
  it('keeps attribution and the illustrative note', () => {
    assert.match(MAP_ATTRIBUTION, /CARTO/);
    assert.match(MAP_ATTRIBUTION, /OpenStreetMap/);
    assert.match(ILLUSTRATIVE_ROUTE_NOTE, /Illustrative/);
  });
});

const stop = (c) => ({ lon: c[0], lat: c[1] });

describe('routesToGeoJSON', () => {
  it('tags each route with id, tone and label', () => {
    const fc = routesToGeoJSON([
      { id: 'a', stops: [stop(SHA), stop(KHI)], tone: 'alternative', label: 'Via Colombo' },
      { id: 'b', stops: [stop(SHA), stop(KHI)], tone: 'blocked' },
    ]);
    assert.equal(fc.features.length, 2);
    assert.equal(fc.features[0].properties.tone, 'alternative');
    assert.equal(fc.features[0].properties.label, 'Via Colombo');
    assert.equal(fc.features[1].properties.id, 'b');
    assert.ok(fc.features[0].geometry.coordinates.length > 2);
  });
  it('defaults unknown tones to primary and skips short routes', () => {
    const fc = routesToGeoJSON([
      { stops: [stop(SHA), stop(KHI)], tone: 'weird' },
      { id: 'x', stops: [stop(SHA)] },
      null,
    ]);
    assert.equal(fc.features.length, 1);
    assert.equal(fc.features[0].properties.tone, 'primary');
    assert.equal(fc.features[0].properties.id, 'route-0');
    assert.deepEqual(ROUTE_TONES, ['primary', 'alternative', 'blocked']);
  });
  it('handles undefined input', () => assert.deepEqual(routesToGeoJSON().features, []));
});

describe('disruptedToGeoJSON', () => {
  const ports = [
    { code: 'CNSHA', name: 'Shanghai', lon: SHA[0], lat: SHA[1] },
    { code: 'SGSIN', name: 'Singapore', lon: 103.8, lat: 1.26 },
  ];
  it('keeps only the disrupted ports', () => {
    const fc = disruptedToGeoJSON(ports, ['SGSIN', 'XXXXX']);
    assert.equal(fc.features.length, 1);
    assert.equal(fc.features[0].properties.code, 'SGSIN');
    assert.deepEqual(fc.features[0].geometry.coordinates, [103.8, 1.26]);
  });
  it('returns no features without codes', () =>
    assert.equal(disruptedToGeoJSON(ports).features.length, 0));
});

describe('progressiveLine', () => {
  const line = [
    [0, 0],
    [10, 0],
    [10, 10],
  ];
  it('returns the start for t = 0 and everything for t = 1', () => {
    assert.deepEqual(progressiveLine(line, 0).coordinates, [[0, 0]]);
    assert.deepEqual(progressiveLine(line, 1).coordinates, line);
    assert.deepEqual(progressiveLine(line, 1).tip, [10, 10]);
  });
  it('interpolates inside a segment', () => {
    const r = progressiveLine(line, 0.25);
    assert.deepEqual(r.tip, [5, 0]);
    assert.deepEqual(r.coordinates, [
      [0, 0],
      [5, 0],
    ]);
  });
  it('passes vertices and clamps t', () => {
    const r = progressiveLine(line, 0.75);
    assert.deepEqual(r.tip, [10, 5]);
    assert.equal(r.coordinates.length, 3);
    assert.deepEqual(progressiveLine(line, 7).coordinates, line);
    assert.deepEqual(progressiveLine(line, -1).coordinates, [[0, 0]]);
    assert.deepEqual(progressiveLine(line, NaN).tip, [0, 0]);
  });
  it('handles empty input', () =>
    assert.deepEqual(progressiveLine([], 0.5), { coordinates: [], tip: null }));
});
