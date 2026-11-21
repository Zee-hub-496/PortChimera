// Test helper: point-in-polygon against the bundled world asset. Points are [lon, lat].
import { readFileSync } from 'node:fs';

export const WORLD_URL = new URL('../../src/assets/world-110m.json', import.meta.url);

export function loadWorld() {
  return JSON.parse(readFileSync(WORLD_URL, 'utf8'));
}

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Builds a function that says whether a [lon, lat] point is on land (outer ring in, holes out). */
export function makeIsLand(world) {
  const polys = [];
  for (const f of world.features) {
    for (const rings of f.geometry.coordinates) {
      let w = Infinity;
      let e = -Infinity;
      let s = Infinity;
      let n = -Infinity;
      for (const [lon, lat] of rings[0]) {
        w = Math.min(w, lon);
        e = Math.max(e, lon);
        s = Math.min(s, lat);
        n = Math.max(n, lat);
      }
      polys.push({ w, e, s, n, rings, name: f.properties.name });
    }
  }
  return function isLand([lon, lat]) {
    const x = lon - 360 * Math.floor((lon + 180) / 360);
    for (const p of polys) {
      if (x < p.w || x > p.e || lat < p.s || lat > p.n) continue;
      if (!inRing(x, lat, p.rings[0])) continue;
      if (p.rings.slice(1).some((h) => inRing(x, lat, h))) continue;
      return p.name;
    }
    return null;
  };
}
