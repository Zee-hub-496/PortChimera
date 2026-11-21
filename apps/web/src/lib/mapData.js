// Pure map helpers. No leaflet import, so node:test can run them.
// Routes here follow hand-drawn sea lanes (see seaLanes.js) for display only. They are not routing results.

import { greatCirclePoints } from './geo.js';
import { seaLanePath } from './seaLanes.js';

export { greatCirclePoints };

export const MAP_ATTRIBUTION =
  'Basemap: <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>, public domain';

export const ILLUSTRATIVE_ROUTE_NOTE =
  'Illustrative route. The line follows a hand-drawn sea lane between ports, not a real vessel track. Not for navigation.';

/**
 * Converts [lon, lat] pairs to Leaflet's [lat, lng] order.
 * @param {Array<[number, number]>} points
 * @returns {Array<[number, number]>}
 */
export function toLatLngs(points) {
  return points.map(([lon, lat]) => [lat, lon]);
}

/**
 * Shifts longitudes by multiples of 360 so consecutive points never jump more than 180.
 * The first point is kept as is.
 * @param {Array<[number, number]>} points
 * @returns {Array<[number, number]>}
 */
export function unwrapLongitudes(points) {
  const out = [];
  let offset = 0;
  for (let i = 0; i < points.length; i++) {
    const [lon, lat] = points[i];
    if (i > 0) {
      const prev = points[i - 1][0];
      const diff = lon - prev;
      if (diff > 180) offset -= 360;
      else if (diff < -180) offset += 360;
    }
    out.push([lon + offset, lat]);
  }
  return out;
}

/**
 * Points for one leg between two stops. Uses the hand-drawn sea lane when both stops are seeded
 * ports with a known lane, otherwise a great-circle arc.
 */
function legPoints(from, to) {
  const a = [from.lon, from.lat];
  const b = [to.lon, to.lat];
  if (from.code && to.code) {
    const lane = seaLanePath(from.code, to.code, a, b);
    if (lane) return lane;
  }
  return greatCirclePoints(a, b);
}

/**
 * GeoJSON LineString feature through the stops, one sea lane (or great-circle arc) per leg.
 * @param {Array<{lon: number, lat: number, code?: string, name?: string}>} stops
 * @param {object} [properties]
 */
export function routeToGeoJSON(stops, properties = {}) {
  const coords = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const leg = legPoints(stops[i], stops[i + 1]);
    coords.push(...(i === 0 ? leg : leg.slice(1)));
  }
  if (coords.length === 0 && stops.length === 1) coords.push([stops[0].lon, stops[0].lat]);
  return {
    type: 'Feature',
    properties,
    geometry: { type: 'LineString', coordinates: unwrapLongitudes(coords) },
  };
}

/**
 * Cuts a line with unwrapped longitudes (it may pass 180 or -180) into pieces that each stay inside
 * [-180, 180], adding a point on the date line at every cut. A map that does not repeat the world
 * draws the pieces as separate lines.
 * @param {Array<[number, number]>} points
 * @returns {Array<Array<[number, number]>>}
 */
export function splitAtDateLine(points) {
  if (!points.length) return [];
  const world = (lon) => Math.floor((lon + 180) / 360);
  let w = world(points[0][0]);
  let cur = [[points[0][0] - 360 * w, points[0][1]]];
  const pieces = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const wb = world(b[0]);
    while (w !== wb) {
      const dir = wb > w ? 1 : -1;
      const boundary = dir > 0 ? -180 + 360 * (w + 1) : -180 + 360 * w;
      const lat = a[1] + ((b[1] - a[1]) * (boundary - a[0])) / (b[0] - a[0]);
      cur.push([dir > 0 ? 180 : -180, lat]);
      pieces.push(cur);
      w += dir;
      cur = [[dir > 0 ? -180 : 180, lat]];
    }
    cur.push([b[0] - 360 * w, b[1]]);
  }
  pieces.push(cur);
  return pieces.length === 1 ? pieces : pieces.filter((p) => p.length >= 2);
}

/**
 * GeoJSON FeatureCollection of port points.
 * @param {Array<{code: string, name: string, country?: string, lat: number, lon: number}>} ports
 * @param {{highlightCodes?: string[]}} [options]
 */
export function portsToGeoJSON(ports, { highlightCodes = [] } = {}) {
  const hi = new Set(highlightCodes);
  return {
    type: 'FeatureCollection',
    features: ports.map((p) => ({
      type: 'Feature',
      properties: {
        code: p.code,
        name: p.name,
        country: p.country ?? '',
        highlight: hi.has(p.code),
      },
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
    })),
  };
}

/**
 * Bounding box [[west, south], [east, north]] that contains every point.
 * Works with unwrapped longitudes. Returns null for no points.
 * @param {Array<[number, number]>} points
 */
export function boundsOf(points) {
  if (!points.length) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [lon, lat] of points) {
    if (lon < w) w = lon;
    if (lon > e) e = lon;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  }
  return [
    [w, s],
    [e, n],
  ];
}

export const ROUTE_TONES = Object.freeze(['primary', 'alternative', 'blocked']);

/**
 * GeoJSON FeatureCollection with one sea-lane LineString per route.
 * Each feature carries id, tone and label so layers can style by tone.
 * Unknown or missing tones become 'primary'. Routes with fewer than two stops are skipped.
 * @param {Array<{id?: string, stops: Array<{lon: number, lat: number}>, tone?: string, label?: string}>} routes
 */
export function routesToGeoJSON(routes) {
  const features = [];
  (routes ?? []).forEach((r, i) => {
    if (!r || !Array.isArray(r.stops) || r.stops.length < 2) return;
    const tone = ROUTE_TONES.includes(r.tone) ? r.tone : 'primary';
    features.push(
      routeToGeoJSON(r.stops, { id: r.id ?? `route-${i}`, tone, label: r.label ?? '' }),
    );
  });
  return { type: 'FeatureCollection', features };
}

/**
 * GeoJSON FeatureCollection of the ports whose code is in `codes`, for warning markers.
 * @param {Array<{code: string, name: string, lat: number, lon: number}>} ports
 * @param {string[]} [codes]
 */
export function disruptedToGeoJSON(ports, codes = []) {
  const set = new Set(codes);
  return {
    type: 'FeatureCollection',
    features: ports
      .filter((p) => set.has(p.code))
      .map((p) => ({
        type: 'Feature',
        properties: { code: p.code, name: p.name },
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      })),
  };
}

/**
 * The first fraction `t` (0 to 1) of a polyline, measured by planar length in degrees.
 * Used to draw a route progressively. `tip` is the last point, where a moving dot goes.
 * @param {Array<[number, number]>} points
 * @param {number} t
 * @returns {{coordinates: Array<[number, number]>, tip: [number, number] | null}}
 */
export function progressiveLine(points, t) {
  if (!points.length) return { coordinates: [], tip: null };
  const frac = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  if (frac >= 1) return { coordinates: points.slice(), tip: points[points.length - 1] };
  if (frac === 0 || points.length === 1) return { coordinates: [points[0]], tip: points[0] };
  const lengths = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const len = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    lengths.push(len);
    total += len;
  }
  if (total === 0) return { coordinates: [points[0]], tip: points[0] };
  let remaining = frac * total;
  const out = [points[0]];
  for (let i = 0; i < lengths.length; i++) {
    if (remaining >= lengths[i]) {
      out.push(points[i + 1]);
      remaining -= lengths[i];
      continue;
    }
    const f = remaining / lengths[i];
    const a = points[i];
    const b = points[i + 1];
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    break;
  }
  return { coordinates: out, tip: out[out.length - 1] };
}
