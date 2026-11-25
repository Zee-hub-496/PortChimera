import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Reads the real theme tokens from index.css and checks WCAG AA (4.5:1) for text pairs, so a
// colour change that makes text hard to read fails here instead of in front of a user.

const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');

function tokens(selector) {
  const start = css.indexOf(`${selector} {\n  color-scheme`);
  assert.ok(start >= 0, `${selector} block not found`);
  const body = css.slice(start, css.indexOf('\n}', start));
  return Object.fromEntries(
    [...body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2]]),
  );
}

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const PAIRS = [
  ['fg', 'canvas'],
  ['fg', 'surface'],
  ['muted', 'canvas'],
  ['muted', 'surface'],
  ['muted', 'surface-2'],
  ['accent', 'canvas'],
  ['accent', 'surface'],
  ['accent', 'accent-soft'],
  ['accent-fg', 'accent'],
  ['brand-fg', 'brand'],
  ['success', 'success-soft'],
  ['warn', 'warn-soft'],
  ['danger', 'danger-soft'],
  ['info', 'info-soft'],
  ['success', 'surface'],
  ['warn', 'surface'],
  ['danger', 'surface'],
];

for (const [name, selector] of [
  ['light', ':root'],
  ['dark', '.dark'],
]) {
  describe(`${name} theme contrast`, () => {
    const t = tokens(selector);
    for (const [fg, bg] of PAIRS) {
      it(`${fg} on ${bg} is at least 4.5:1`, () => {
        assert.ok(t[fg] && t[bg], `missing token ${fg} or ${bg}`);
        const r = ratio(t[fg], t[bg]);
        assert.ok(r >= 4.5, `${t[fg]} on ${t[bg]} is ${r.toFixed(2)}:1`);
      });
    }
  });
}
