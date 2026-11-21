// Small pure geometry helpers shared by the map modules. Points are [lon, lat] in degrees.

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

const EARTH_RADIUS_KM = 6371;

/**
 * Great-circle distance in kilometres between two [lon, lat] points.
 * @param {[number, number]} a
 * @param {[number, number]} b
 */
export function distanceKm(a, b) {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Points along the great circle from a to b, both included. Each point is [lon, lat].
 * @param {[number, number]} a [lon, lat]
 * @param {[number, number]} b [lon, lat]
 * @param {number} [n] number of segments (at least 1)
 * @returns {Array<[number, number]>}
 */
export function greatCirclePoints(a, b, n = 64) {
  const steps = Math.max(1, Math.floor(n));
  const [lon1, lat1] = [rad(a[0]), rad(a[1])];
  const [lon2, lat2] = [rad(b[0]), rad(b[1])];
  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
      ),
    );
  if (d < 1e-9)
    return [
      [a[0], a[1]],
      [b[0], b[1]],
    ];
  const out = [[a[0], a[1]]];
  for (let i = 1; i < steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    out.push([deg(Math.atan2(y, x)), deg(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
  }
  out.push([b[0], b[1]]);
  return out;
}

/**
 * Joins the points with great-circle pieces no longer than `maxKm` each. Every input point is kept.
 * @param {Array<[number, number]>} points
 * @param {number} maxKm
 * @returns {Array<[number, number]>}
 */
export function densify(points, maxKm) {
  if (points.length < 2) return points.map((p) => [p[0], p[1]]);
  const out = [[points[0][0], points[0][1]]];
  for (let i = 1; i < points.length; i++) {
    const n = Math.max(1, Math.ceil(distanceKm(points[i - 1], points[i]) / maxKm));
    out.push(...greatCirclePoints(points[i - 1], points[i], n).slice(1));
  }
  return out;
}
