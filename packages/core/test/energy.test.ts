import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanRecords, isEnergyDataStale, summarizeSeries } from '../src/energy/series.ts';

const NOW = new Date('2026-11-28T12:00:00Z');

const SERIES = [
  { date: '2026-11-27', value: 80 },
  { date: '2026-11-26', value: 79 },
  { date: '2026-11-25', value: 78 },
  { date: '2026-11-24', value: 77 },
  { date: '2026-11-23', value: 76 },
  { date: '2026-11-20', value: 100 },
];

test('daily and weekly change are computed from the returned values', () => {
  const s = summarizeSeries(SERIES, NOW);
  assert.ok(s);
  assert.equal(s.latest.value, 80);
  assert.equal(s.previous?.value, 79);
  assert.equal(s.dailyChangePct, 1.27);
  // base = last record on or before 2026-11-20 -> 100
  assert.equal(s.weeklyChangePct, -20);
  assert.equal(s.weeklyTrend, 'DOWN');
  assert.equal(s.dataAgeDays, 1);
  assert.equal(isEnergyDataStale(s), false);
});

test('input order does not matter and duplicate dates keep one record', () => {
  const shuffled = [...SERIES].reverse().concat([{ date: '2026-11-27', value: 80 }]);
  const { records } = cleanRecords(shuffled);
  assert.equal(records.length, SERIES.length);
  assert.equal(records[0]?.date, '2026-11-27');
});

test('string numbers from an API are accepted, malformed rows are dropped and counted', () => {
  const { records, dropped } = cleanRecords([
    { date: '2026-11-27', value: '80.5' },
    { date: '2026-11-26', value: null },
    { date: 'yesterday', value: 3 },
    { date: '2026-11-25', value: -4 },
    { date: '2026-11-24', value: Number.NaN },
    null,
    'x',
  ]);
  assert.deepEqual(records, [{ date: '2026-11-27', value: 80.5 }]);
  assert.equal(dropped, 6);
});

test('no valid data returns null and never an invented value', () => {
  assert.equal(summarizeSeries([], NOW), null);
  assert.equal(summarizeSeries([{ date: 'bad', value: 1 }], NOW), null);
});

test('a single record has no change figures', () => {
  const s = summarizeSeries([{ date: '2026-11-27', value: 80 }], NOW);
  assert.ok(s);
  assert.equal(s.dailyChangePct, null);
  assert.equal(s.weeklyChangePct, null);
  assert.equal(s.weeklyTrend, null);
});

test('old data is flagged stale', () => {
  const s = summarizeSeries([{ date: '2026-11-10', value: 80 }], NOW);
  assert.ok(s);
  assert.equal(s.dataAgeDays, 18);
  assert.equal(isEnergyDataStale(s), true);
});

test('small weekly move is FLAT', () => {
  const s = summarizeSeries(
    [
      { date: '2026-11-27', value: 100.2 },
      { date: '2026-11-20', value: 100 },
    ],
    NOW,
  );
  assert.equal(s?.weeklyTrend, 'FLAT');
});
