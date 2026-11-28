// Small pure geometry helpers. Points are [lon, lat] in degrees, like GeoJSON.

export type LonLat = readonly [number, number];

const rad = (d: number): number => (d * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;
const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in kilometres between two [lon, lat] points. */
export function distanceKm(a: LonLat, b: LonLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Points along the great circle from a to b, both included, in `n` segments. */
export function greatCirclePoints(a: LonLat, b: LonLat, n = 64): LonLat[] {
  const steps = Math.max(1, Math.floor(n));
  const lon1 = rad(a[0]);
  const lat1 = rad(a[1]);
  const lon2 = rad(b[0]);
  const lat2 = rad(b[1]);
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
  const out: LonLat[] = [[a[0], a[1]]];
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

/** Joins the points with great-circle pieces no longer than `maxKm`. Every input point is kept. */
export function densify(points: readonly LonLat[], maxKm: number): LonLat[] {
  const first = points[0];
  if (first === undefined) return [];
  if (points.length < 2) return [[first[0], first[1]]];
  const out: LonLat[] = [[first[0], first[1]]];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1] as LonLat;
    const cur = points[i] as LonLat;
    const n = Math.max(1, Math.ceil(distanceKm(prev, cur) / maxKm));
    out.push(...greatCirclePoints(prev, cur, n).slice(1));
  }
  return out;
}

/** Wraps a longitude into [-180, 180). */
export const wrapLon = (lon: number): number => lon - 360 * Math.floor((lon + 180) / 360);

/** Smallest distance from `point` to any vertex of an already densified path, in km. */
export function distanceToPathKm(point: LonLat, densePath: readonly LonLat[]): number {
  let best = Infinity;
  for (const p of densePath) best = Math.min(best, distanceKm(point, [wrapLon(p[0]), p[1]]));
  return best;
}
