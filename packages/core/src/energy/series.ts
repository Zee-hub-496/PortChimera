import type { OilMarketRecord } from '../intelligence/types.ts';

export type Trend = 'UP' | 'DOWN' | 'FLAT';

export interface EnergySummary {
  readonly latest: OilMarketRecord;
  readonly previous: OilMarketRecord | null;
  /** (latest - previous) / previous * 100, two decimals. Null without a previous record. */
  readonly dailyChangePct: number | null;
  /** Compared with the last record on or before (latest date - 7 days). Null if none. */
  readonly weeklyChangePct: number | null;
  readonly weeklyTrend: Trend | null;
  /** Calendar days between the latest record's date and `now`. */
  readonly dataAgeDays: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FLAT_BAND_PCT = 0.5;
const DAY_MS = 86_400_000;

const dayNumber = (date: string): number => Date.parse(`${date}T00:00:00Z`) / DAY_MS;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Keeps valid, unique-by-date records, newest first. Invalid rows are counted, not guessed. */
export function cleanRecords(rows: readonly unknown[]): {
  records: OilMarketRecord[];
  dropped: number;
} {
  const byDate = new Map<string, OilMarketRecord>();
  let dropped = 0;
  for (const row of rows) {
    const r = row as { date?: unknown; value?: unknown } | null;
    const value = typeof r?.value === 'string' ? Number(r.value) : r?.value;
    if (
      typeof r?.date === 'string' &&
      DATE.test(r.date) &&
      Number.isFinite(dayNumber(r.date)) &&
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value > 0
    ) {
      byDate.set(r.date, { date: r.date, value });
    } else {
      dropped += 1;
    }
  }
  const records = [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  return { records, dropped };
}

/** Summary of a daily price series. Returns null when there is no valid record. */
export function summarizeSeries(rows: readonly unknown[], now: Date): EnergySummary | null {
  const { records } = cleanRecords(rows);
  const latest = records[0];
  if (latest === undefined) return null;
  const previous = records[1] ?? null;
  const dailyChangePct =
    previous === null ? null : round2(((latest.value - previous.value) / previous.value) * 100);

  const weekAgo = dayNumber(latest.date) - 7;
  const base = records.find((r) => dayNumber(r.date) <= weekAgo) ?? null;
  const weeklyChangePct =
    base === null ? null : round2(((latest.value - base.value) / base.value) * 100);
  const weeklyTrend: Trend | null =
    weeklyChangePct === null
      ? null
      : weeklyChangePct > FLAT_BAND_PCT
        ? 'UP'
        : weeklyChangePct < -FLAT_BAND_PCT
          ? 'DOWN'
          : 'FLAT';

  const today = Math.floor(now.getTime() / DAY_MS);
  return {
    latest,
    previous,
    dailyChangePct,
    weeklyChangePct,
    weeklyTrend,
    dataAgeDays: Math.max(0, today - dayNumber(latest.date)),
  };
}

/** EIA publishes business days with a lag, so "stale" means older than this many days. */
export const ENERGY_STALE_AFTER_DAYS = 5;

export const isEnergyDataStale = (summary: EnergySummary): boolean =>
  summary.dataAgeDays > ENERGY_STALE_AFTER_DAYS;
