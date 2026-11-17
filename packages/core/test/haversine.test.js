import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm } from '../src/index.js';

const shanghai = { lat: 31.2304, lon: 121.4737 };
const singapore = { lat: 1.2644, lon: 103.8223 };

const approx = (actual, expected, tolerance) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} not within ${tolerance} of ${expected}`,
  );

describe('haversineKm', () => {
  it('returns 0 for the same point', () => {
    assert.equal(haversineKm(shanghai, shanghai), 0);
  });

  it('is symmetric', () => {
    approx(haversineKm(shanghai, singapore), haversineKm(singapore, shanghai), 1e-6);
  });

  it('gives roughly 3,800 km between Shanghai and Singapore', () => {
    // Sanity range, not an exact reference value.
    const km = haversineKm(shanghai, singapore);
    assert.ok(km > 3700 && km < 3900, `unexpected distance ${km}`);
  });

  it('gives half the Earth circumference for antipodal points', () => {
    approx(haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 180 }), 20015.1, 0.5);
  });

  it('rejects out-of-range or non-numeric coordinates', () => {
    assert.throws(() => haversineKm({ lat: 91, lon: 0 }, shanghai), RangeError);
    assert.throws(() => haversineKm({ lat: 'x', lon: 0 }, shanghai), TypeError);
  });
});
