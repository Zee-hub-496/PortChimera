import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  greatCirclePoints,
  unwrapLongitudes,
  routeToGeoJSON,
  portsToGeoJSON,
  boundsOf,
  CARTO_STYLES,
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
  it('picks the style by theme', () => {
    assert.equal(styleFor('dark'), CARTO_STYLES.dark);
    assert.equal(styleFor('light'), CARTO_STYLES.light);
    assert.notEqual(CARTO_STYLES.dark, CARTO_STYLES.light);
  });
  it('keeps attribution and the illustrative note', () => {
    assert.match(MAP_ATTRIBUTION, /CARTO/);
    assert.match(MAP_ATTRIBUTION, /OpenStreetMap/);
    assert.match(ILLUSTRATIVE_ROUTE_NOTE, /Illustrative/);
  });
});
