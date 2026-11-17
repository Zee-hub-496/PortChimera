const EARTH_RADIUS_KM = 6371.0088;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

/**
 * Great-circle distance between two points on Earth, in kilometres.
 *
 * Why this lives in core: the A* heuristic will use it. A straight line over the globe is
 * never longer than any real shipping lane between the same two ports, so it can only
 * underestimate the remaining distance. That property ("admissible") is what keeps A* correct.
 *
 * @param {{lat: number, lon: number}} a
 * @param {{lat: number, lon: number}} b
 * @returns {number} distance in km
 */
export function haversineKm(a, b) {
  for (const p of [a, b]) {
    if (!Number.isFinite(p?.lat) || !Number.isFinite(p?.lon)) {
      throw new TypeError('haversineKm needs numeric lat and lon');
    }
    if (p.lat < -90 || p.lat > 90 || p.lon < -180 || p.lon > 180) {
      throw new RangeError('lat must be in [-90, 90] and lon in [-180, 180]');
    }
  }
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
