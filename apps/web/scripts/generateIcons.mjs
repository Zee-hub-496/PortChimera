// Generates the PNG icons in apps/web/public from the same shapes as public/favicon.svg.
// Node only (zlib), no image tools needed. Run: node apps/web/scripts/generateIcons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const NAVY = [11, 31, 58];
const ICE = [230, 241, 245];
const CYAN = [34, 211, 238];

// Shapes in a 64x64 space, painted in order. Each has a coverage test for a point.
const inRoundRect = (x, y) => {
  const r = 14;
  const cx = Math.min(Math.max(x, r), 64 - r);
  const cy = Math.min(Math.max(y, r), 64 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const dist = (x, y, cx, cy) => Math.hypot(x - cx, y - cy);
const inTri = (x, y, [a, b, c]) => {
  const s = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  const p = [x, y];
  const d1 = s(p, a, b);
  const d2 = s(p, b, c);
  const d3 = s(p, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

const SHAPES = [
  [inRoundRect, NAVY],
  [(x, y) => Math.abs(dist(x, y, 32, 32) - 22) <= 2, ICE],
  [
    (x, y) =>
      inTri(x, y, [
        [32, 13],
        [38, 32],
        [26, 32],
      ]),
    CYAN,
  ],
  [
    (x, y) =>
      inTri(x, y, [
        [26, 32],
        [38, 32],
        [32, 51],
      ]),
    ICE,
  ],
  [(x, y) => dist(x, y, 32, 32) <= 3, NAVY],
  [(x, y) => dist(x, y, 47.5, 16.5) <= 5.5, NAVY],
  [(x, y) => dist(x, y, 47.5, 16.5) <= 4, CYAN],
];

function render(size) {
  const ss = 4;
  const px = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let pxl = 0; pxl < size; pxl++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = ((pxl + (sx + 0.5) / ss) * 64) / size;
          const y = ((py + (sy + 0.5) / ss) * 64) / size;
          let color = null;
          for (const [test, c] of SHAPES) if (test(x, y)) color = c;
          if (color) {
            r += color[0];
            g += color[1];
            b += color[2];
            a += 1;
          }
        }
      }
      const i = (py * size + pxl) * 4;
      if (a > 0) {
        px[i] = Math.round(r / a);
        px[i + 1] = Math.round(g / a);
        px[i + 2] = Math.round(b / a);
      }
      px[i + 3] = Math.round((a / (ss * ss)) * 255);
    }
  }
  return px;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Encodes RGBA pixels as a PNG file. */
export function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0;
    rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const OUTPUTS = {
  'favicon-32.png': 32,
  'apple-touch-icon.png': 180,
  'icon-192.png': 192,
  'icon-512.png': 512,
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = new URL('../public/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  for (const [name, size] of Object.entries(OUTPUTS)) {
    writeFileSync(new URL(name, dir), encodePng(size, render(size)));
    console.log(`wrote public/${name}`);
  }
}
