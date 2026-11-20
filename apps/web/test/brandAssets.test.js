import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SIZES = {
  'favicon-32.png': 32,
  'apple-touch-icon.png': 180,
  'icon-192.png': 192,
  'icon-512.png': 512,
};

describe('brand assets', () => {
  for (const [name, size] of Object.entries(SIZES)) {
    it(`${name} is a ${size}px PNG`, async () => {
      const buf = await readFile(new URL(`../public/${name}`, import.meta.url));
      assert.ok(buf.subarray(0, 8).equals(SIG));
      assert.equal(buf.readUInt32BE(16), size);
      assert.equal(buf.readUInt32BE(20), size);
    });
  }
  it('has an svg favicon and a manifest that points at real icons', async () => {
    const svg = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');
    assert.match(svg, /<svg/);
    const m = JSON.parse(
      await readFile(new URL('../public/site.webmanifest', import.meta.url), 'utf8'),
    );
    for (const icon of m.icons) {
      await readFile(new URL(`../public${icon.src}`, import.meta.url));
    }
  });
});
