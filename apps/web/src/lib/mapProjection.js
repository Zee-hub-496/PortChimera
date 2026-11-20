// Pure projection of ports onto an SVG viewBox using a plain longitude/latitude (equirectangular) map.
// x grows with longitude, y grows downward as latitude falls. Not geographically accurate; it is a sketch.
export function projectPorts(ports, { width = 600, height = 300, padding = 24 } = {}) {
  const valid = ports.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (valid.length === 0) return [];
  const lons = valid.map((p) => p.lon);
  const lats = valid.map((p) => p.lat);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const innerW = width - 2 * padding;
  const innerH = height - 2 * padding;
  const scale = (v, min, max, size) => (max === min ? size / 2 : ((v - min) / (max - min)) * size);
  return valid.map((p) => ({
    ...p,
    x: Math.round((padding + scale(p.lon, minLon, maxLon, innerW)) * 10) / 10,
    y: Math.round((padding + innerH - scale(p.lat, minLat, maxLat, innerH)) * 10) / 10,
  }));
}

/** SVG "points" string for a polyline through the projected stops, in order. */
export function toPolylinePoints(projected) {
  return projected.map((p) => `${p.x},${p.y}`).join(' ');
}

/** Picks the projected ports that are on the route, in route order. Unknown codes are skipped. */
export function pickPathStops(projected, path) {
  const byCode = new Map(projected.map((p) => [p.code, p]));
  return path.map((s) => byCode.get(s.code)).filter(Boolean);
}
