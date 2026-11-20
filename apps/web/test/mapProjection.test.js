import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickPathStops, projectPorts, toPolylinePoints } from '../src/lib/mapProjection.js';

const ports = [
  { code: 'W', lat: 0, lon: -10 },
  { code: 'E', lat: 10, lon: 10 },
  { code: 'M', lat: 5, lon: 0 },
];
const box = { width: 200, height: 100, padding: 10 };

describe('projectPorts', () => {
  it('maps west/south to the left/bottom and east/north to the right/top', () => {
    const [w, e, m] = projectPorts(ports, box);
    assert.deepEqual([w.x, w.y], [10, 90]);
    assert.deepEqual([e.x, e.y], [190, 10]);
    assert.deepEqual([m.x, m.y], [100, 50]);
  });
  it('keeps every point inside the viewBox', () => {
    for (const p of projectPorts(ports, box)) {
      assert.ok(p.x >= 10 && p.x <= 190 && p.y >= 10 && p.y <= 90);
    }
  });
  it('centres a single port and skips ports without coordinates', () => {
    const r = projectPorts(
      [
        { code: 'A', lat: 1, lon: 2 },
        { code: 'B', lat: null, lon: null },
      ],
      box,
    );
    assert.equal(r.length, 1);
    assert.deepEqual([r[0].x, r[0].y], [100, 50]);
  });
  it('returns an empty list for no ports', () => {
    assert.deepEqual(projectPorts([]), []);
  });
});

describe('pickPathStops and toPolylinePoints', () => {
  it('keeps route order and skips unknown codes', () => {
    const projected = projectPorts(ports, box);
    const stops = pickPathStops(projected, [{ code: 'W' }, { code: 'ZZ' }, { code: 'E' }]);
    assert.deepEqual(
      stops.map((s) => s.code),
      ['W', 'E'],
    );
    assert.equal(toPolylinePoints(stops), '10,90 190,10');
  });
});
