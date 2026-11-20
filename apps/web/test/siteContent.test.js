import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as content from '../src/lib/siteContent.js';
import { SAMPLE_PORTS, SAMPLE_SHIPMENT } from '../src/lib/samplePorts.js';

const text = JSON.stringify([content, SAMPLE_SHIPMENT]);

describe('siteContent', () => {
  it('uses only known statuses', () => {
    for (const c of content.CAPABILITIES) assert.ok(content.STATUSES.includes(c.status), c.id);
  });
  it('marks crisis rerouting as coming soon', () => {
    assert.equal(content.CAPABILITIES.find((c) => c.id === 'crisis').status, 'coming soon');
    assert.equal(content.HOW_IT_WORKS[2].note, 'UI coming soon');
  });
  it('has three ordered steps and the four nav links', () => {
    assert.deepEqual(
      content.HOW_IT_WORKS.map((s) => s.step),
      [1, 2, 3],
    );
    assert.equal(content.NAV_LINKS.length, 4);
  });
  it('avoids banned wording and em dashes', () => {
    assert.ok(!text.includes('\u2014'));
    for (const w of ['fraud', 'trusted by', 'guaranteed', 'multi-tenant']) {
      assert.ok(!text.toLowerCase().includes(w), w);
    }
  });
  it('gives footer links to anchors, routes or plain text', () => {
    for (const col of content.FOOTER_COLUMNS)
      for (const l of col.links) assert.ok(l.href === null || l.href.startsWith('/'));
  });
});

describe('samplePorts', () => {
  it('has the five landing ports with finite coordinates', () => {
    assert.deepEqual(
      SAMPLE_PORTS.map((p) => p.name),
      ['Shanghai', 'Singapore', 'Karachi', 'Rotterdam', 'Jebel Ali'],
    );
    for (const p of SAMPLE_PORTS) {
      assert.ok(Number.isFinite(p.lat) && Number.isFinite(p.lon));
      assert.ok(p.lat >= -90 && p.lat <= 90 && p.lon >= -180 && p.lon <= 180);
    }
  });
  it('labels the sample shipment', () => {
    assert.equal(SAMPLE_SHIPMENT.number, 'SHP-003');
    assert.equal(SAMPLE_SHIPMENT.origin.code, 'CNSHA');
    assert.equal(SAMPLE_SHIPMENT.destination.code, 'PKKHI');
    assert.match(SAMPLE_SHIPMENT.label, /illustrative/);
  });
  it('matches the seeded ports', async () => {
    const { readFile } = await import('node:fs/promises');
    const seed = JSON.parse(
      await readFile(new URL('../../../supabase/seed/ports.json', import.meta.url), 'utf8'),
    );
    for (const p of SAMPLE_PORTS) {
      const s = seed.find((x) => x.code === p.code);
      assert.ok(s, p.code);
      assert.equal(s.lat, p.lat);
      assert.equal(s.lon, p.lon);
      assert.equal(s.name, p.name);
    }
  });
});
