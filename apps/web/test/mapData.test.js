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
  splitAtDateLine,
  toLatLngs,
  MAP_ATTRIBUTION,
  ILLUSTRATIVE_ROUTE_NOTE,
} from '../src/lib/mapData.js';

const stopOf = (c) => ({ lon: c[0], lat: c[1] });
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

describe('helpers and attribution', () => {
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
  it('credits Natural Earth and names no tile service', () => {
    assert.match(MAP_ATTRIBUTION, /Natural Earth/);
    assert.match(MAP_ATTRIBUTION, /public domain/);
    assert.doesNotMatch(MAP_ATTRIBUTION, /CARTO|OpenStreetMap/i);
    assert.match(ILLUSTRATIVE_ROUTE_NOTE, /Illustrative/);
    assert.match(ILLUSTRATIVE_ROUTE_NOTE, /sea lane/);
  });
});

describe('sea lanes in routes', () => {
  const sg = { code: 'SGSIN', lon: 103.82, lat: 1.26 };
  const khi = { code: 'PKKHI', lon: 66.98, lat: 24.84 };
  it('draws a seeded lane along its waypoints instead of the great-circle arc', () => {
    const lane = routeToGeoJSON([sg, khi]).geometry.coordinates;
    const arc = greatCirclePoints([sg.lon, sg.lat], [khi.lon, khi.lat], 64);
    assert.ok(lane.length > 20);
    assert.notDeepEqual(lane, arc);
    assert.deepEqual(lane[0], [sg.lon, sg.lat]);
    assert.deepEqual(lane[lane.length - 1], [khi.lon, khi.lat]);
    // The Malacca waypoint, which a straight arc to Karachi never goes near.
    assert.ok(lane.some(([lon, lat]) => Math.abs(lon - 101) < 0.1 && Math.abs(lat - 2.7) < 0.1));
  });
  it('falls back to the arc for a pair without a lane', () => {
    const lane = routeToGeoJSON([sg, { code: 'USLAX', lon: -118.26, lat: 33.73 }]);
    assert.equal(lane.geometry.coordinates.length, 65);
  });
  it('falls back to the arc for stops without codes', () => {
    assert.equal(routeToGeoJSON([stopOf(SHA), stopOf(KHI)]).geometry.coordinates.length, 65);
  });
});

describe('splitAtDateLine', () => {
  it('leaves a line inside the world as one piece', () => {
    const line = [
      [10, 0],
      [20, 5],
    ];
    assert.deepEqual(splitAtDateLine(line), [line]);
  });
  it('cuts an eastward line at 180 and continues from -180', () => {
    const pieces = splitAtDateLine([
      [170, 10],
      [190, 30],
      [200, 30],
    ]);
    assert.equal(pieces.length, 2);
    assert.deepEqual(pieces[0], [
      [170, 10],
      [180, 20],
    ]);
    assert.deepEqual(pieces[1], [
      [-180, 20],
      [-170, 30],
      [-160, 30],
    ]);
  });
  it('cuts a westward line at -180', () => {
    const pieces = splitAtDateLine([
      [-170, 0],
      [-190, 10],
    ]);
    assert.deepEqual(pieces, [
      [
        [-170, 0],
        [-180, 5],
      ],
      [
        [180, 5],
        [170, 10],
      ],
    ]);
  });
  it('keeps every piece inside [-180, 180] for a real Pacific lane', () => {
    const sha = { code: 'CNSHA', lon: 121.47, lat: 31.23 };
    const lax = { code: 'USLAX', lon: -118.26, lat: 33.73 };
    const line = routeToGeoJSON([sha, lax]).geometry.coordinates;
    assert.ok(Math.max(...line.map((p) => p[0])) > 180);
    const pieces = splitAtDateLine(line);
    assert.equal(pieces.length, 2);
    for (const p of pieces.flat()) assert.ok(p[0] >= -180 && p[0] <= 180);
  });
  it('handles empty input', () => assert.deepEqual(splitAtDateLine([]), []));
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
