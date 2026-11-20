import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFixtures } from '../../../../scripts/generate-document-fixtures.mjs';

const DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'fixtures',
  'documents',
);

test('regenerating gives the same bytes as the committed fixtures', () => {
  const built = buildFixtures();
  assert.deepEqual(readdirSync(DIR).sort(), Object.keys(built).sort());
  for (const [name, bytes] of Object.entries(built)) {
    assert.ok(readFileSync(join(DIR, name)).equals(bytes), `${name} differs`);
  }
});

test('building twice is deterministic', () => {
  const a = buildFixtures();
  const b = buildFixtures();
  for (const name of Object.keys(a)) assert.ok(a[name].equals(b[name]));
});

test('fixtures are labeled synthetic', () => {
  const pdfs = Object.entries(buildFixtures()).filter(
    ([n]) => n.endsWith('.pdf') && !n.startsWith('fake'),
  );
  for (const [, bytes] of pdfs) assert.match(bytes.toString('latin1'), /SYNTHETIC TEST DOCUMENT/);
  assert.match(readFileSync(join(DIR, 'README.txt'), 'utf8'), /SYNTHETIC/);
});
