import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_CATEGORIES,
  REGIONS,
  SOURCE_CLASSES,
  CHOKEPOINTS,
} from '../../../packages/core/src/v2.ts';
import {
  CATEGORY_LABELS,
  CHOKEPOINT_NAMES,
  NEWS_PAGE_SIZE,
  REGION_OPTIONS,
  SOURCE_CLASS_LABELS,
  SOURCE_CLASS_TONES,
  buildChart,
  buildNewsPath,
  energyFreshness,
  formatAge,
  formatDay,
  formatPct,
  formatPrice,
  formatUtc,
  newsFreshness,
  pctTone,
} from '../src/lib/intelligenceView.ts';
import { buildBreadcrumbs } from '../src/lib/breadcrumbs.js';
import { PAGE_ITEMS } from '../src/lib/search.js';

test('duplicated constants stay equal to core', () => {
  assert.deepEqual(Object.keys(CATEGORY_LABELS).sort(), [...EVENT_CATEGORIES].sort());
  assert.deepEqual(Object.keys(SOURCE_CLASS_LABELS).sort(), [...SOURCE_CLASSES].sort());
  assert.deepEqual(Object.keys(SOURCE_CLASS_TONES).sort(), [...SOURCE_CLASSES].sort());
  assert.deepEqual(
    REGION_OPTIONS.map((r) => [r.id, r.label]),
    REGIONS.map((r) => [r.id, r.name]),
  );
  assert.deepEqual(
    Object.entries(CHOKEPOINT_NAMES).sort(),
    CHOKEPOINTS.map((c) => [c.id, c.name]).sort(),
  );
});

test('chokepoint names also match the web display list', async () => {
  const { CHOKEPOINTS: web } = await import('../src/lib/chokepoints.js');
  assert.deepEqual(
    Object.entries(CHOKEPOINT_NAMES).sort(),
    web.map((c: { id: string; name: string }) => [c.id, c.name]).sort(),
  );
});

test('a media report is never labelled as confirmed', () => {
  assert.match(SOURCE_CLASS_LABELS.MEDIA_REPORT, /not confirmed/);
  assert.doesNotMatch(Object.values(SOURCE_CLASS_LABELS).join(' '), /live|real.time/i);
});

test('buildNewsPath leaves out empty filters and clamps the page', () => {
  assert.equal(buildNewsPath({}), `/api/intelligence/news?page=1&pageSize=${NEWS_PAGE_SIZE}`);
  const u = new URL(
    `http://x${buildNewsPath({ q: '  hormuz tanker ', region: 'persian-gulf', category: 'PIRACY', sourceClass: 'MEDIA_REPORT', page: 3.7, refresh: true })}`,
  );
  assert.equal(u.searchParams.get('q'), 'hormuz tanker');
  assert.equal(u.searchParams.get('region'), 'persian-gulf');
  assert.equal(u.searchParams.get('page'), '3');
  assert.equal(u.searchParams.get('refresh'), 'true');
  assert.equal(new URL(`http://x${buildNewsPath({ page: -4 })}`).searchParams.get('page'), '1');
  assert.equal(new URL(`http://x${buildNewsPath({ q: 'a&b=c' })}`).searchParams.get('b'), null);
  assert.equal(
    new URL(`http://x${buildNewsPath({ q: 'x'.repeat(500) })}`).searchParams.get('q')?.length,
    100,
  );
});

test('formatAge', () => {
  assert.equal(formatAge(5), 'just now');
  assert.equal(formatAge(125), '2 min ago');
  assert.equal(formatAge(7300), '2 h ago');
  assert.equal(formatAge(200000), '2 d ago');
  assert.equal(formatAge(-5), 'just now');
});

test('formatUtc and formatDay', () => {
  assert.equal(formatUtc('2026-11-27T10:15:00Z'), '27 Nov 2026, 10:15 UTC');
  assert.equal(formatUtc(null), null);
  assert.equal(formatUtc('not a date'), null);
  assert.equal(formatDay('2026-11-07'), '7 Nov 2026');
  assert.equal(formatDay('garbage'), 'garbage');
});

test('newsFreshness: stale and partial data are flagged, fresh data does not say live', () => {
  const base = {
    fetchedAt: '2026-11-28T09:00:00Z',
    ageSeconds: 1000,
    stale: false,
    refreshThrottled: false,
    queriesFailed: 0,
  };
  const ok = newsFreshness(base);
  assert.equal(ok.tone, 'neutral');
  assert.match(ok.text, /not real-time monitoring/);
  assert.doesNotMatch(`${ok.title} ${ok.text}`, /\blive\b/i);
  const stale = newsFreshness({ ...base, stale: true, ageSeconds: 4000 });
  assert.equal(stale.tone, 'warn');
  assert.match(stale.text, /Newer events may be missing/);
  assert.equal(newsFreshness({ ...base, queriesFailed: 2 }).title, 'Partly updated');
});

test('price formatting uses real values only', () => {
  assert.equal(formatPrice(80.1), '$80.10');
  assert.equal(formatPct(1.27), '+1.27%');
  assert.equal(formatPct(-0.5), '-0.50%');
  assert.equal(formatPct(0), '0.00%');
  assert.equal(formatPct(null), 'n/a');
  assert.equal(pctTone(null), 'neutral');
  assert.equal(pctTone(2), 'warn');
  assert.equal(pctTone(-2), 'info');
});

test('energyFreshness: stale refresh and old data are explained, fresh data is silent', () => {
  const summary = {
    latest: { date: '2026-11-01', value: 80 },
    previous: null,
    dailyChangePct: null,
    weeklyChangePct: null,
    weeklyTrend: null,
    dataAgeDays: 27,
  };
  assert.equal(energyFreshness({ stale: false, dataStale: false, fetchedAt: 'x', summary }), null);
  assert.match(
    energyFreshness({ stale: true, dataStale: false, fetchedAt: '2026-11-28T09:00:00Z', summary })
      ?.text ?? '',
    /could not be reached/,
  );
  assert.match(
    energyFreshness({ stale: false, dataStale: true, fetchedAt: 'x', summary })?.text ?? '',
    /27 days ago/,
  );
});

test('buildChart maps higher prices higher up and stays inside the box', () => {
  assert.equal(buildChart([{ date: '2026-11-01', value: 1 }], 100, 50), null);
  const c = buildChart(
    [
      { date: '2026-11-01', value: 10 },
      { date: '2026-11-02', value: 20 },
      { date: '2026-11-03', value: 15 },
    ],
    100,
    50,
    5,
  );
  assert.ok(c);
  assert.equal(c.min, 10);
  assert.equal(c.max, 20);
  const [a, b, d] = c.points;
  assert.ok(a && b && d);
  assert.equal(a.x, 5);
  assert.equal(d.x, 95);
  assert.ok(b.y < a.y && b.y < d.y); // 20 is drawn above 10 and 15
  assert.equal(b.y, 5);
  assert.equal(a.y, 45);
  assert.ok(c.points.every((p) => p.x >= 5 && p.x <= 95 && p.y >= 5 && p.y <= 45));
  assert.match(c.line, /^M5 45 L50 5 L95 25$/);
  assert.match(c.area, /Z$/);
});

test('a flat series does not divide by zero', () => {
  const c = buildChart(
    [
      { date: 'a', value: 5 },
      { date: 'b', value: 5 },
    ],
    100,
    50,
  );
  assert.ok(c);
  assert.ok(c.points.every((p) => Number.isFinite(p.y)));
});

test('breadcrumbs and search know the new pages', () => {
  assert.deepEqual(buildBreadcrumbs('/intelligence/world-monitor'), [
    { label: 'Maritime Intelligence' },
    { label: 'World Monitor' },
  ]);
  assert.deepEqual(buildBreadcrumbs('/intelligence/energy'), [
    { label: 'Maritime Intelligence' },
    { label: 'Energy Watch' },
  ]);
  const signedIn = PAGE_ITEMS(true).map((p: { to: string }) => p.to);
  assert.ok(signedIn.includes('/intelligence/world-monitor'));
  assert.ok(signedIn.includes('/intelligence/energy'));
  const signedOut = PAGE_ITEMS(false).map((p: { to: string }) => p.to);
  assert.ok(!signedOut.some((to: string) => to.startsWith('/intelligence')));
});
