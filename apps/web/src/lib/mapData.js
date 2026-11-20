// Pure map helpers. No maplibre import, so node:test can run them.
// Routes here are drawn as great-circle arcs for display only; they are not routing results.

export const CARTO_STYLES = Object.freeze({
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
});

export const MAP_ATTRIBUTION = '© OpenStreetMap contributors © CARTO';

export const ILLUSTRATIVE_ROUTE_NOTE =
  'Illustrative route. The line shows a great-circle arc between ports, not a real vessel track.';

/**
 * Style URL for the resolved theme.
 * @param {'light'|'dark'} resolvedTheme
 */
export function styleFor(resolvedTheme) {
  return resolvedTheme === 'dark' ? CARTO_STYLES.dark : CARTO_STYLES.light;
}

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

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
 * GeoJSON LineString feature through the stops, one great-circle arc per leg.
 * @param {Array<{lon: number, lat: number, code?: string, name?: string}>} stops
 * @param {object} [properties]
 */
export function routeToGeoJSON(stops, properties = {}) {
  const coords = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const leg = greatCirclePoints(
      [stops[i].lon, stops[i].lat],
      [stops[i + 1].lon, stops[i + 1].lat],
    );
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
