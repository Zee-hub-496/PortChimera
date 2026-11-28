// Pure helpers for the Maritime Intelligence pages: labels, formatting, chart geometry and the
// request path. No React and no fetch, so node:test can run them.
//
// Runtime constants are duplicated from @portchimera/core on purpose: the browser bundle never
// imports core. apps/web/test/intelligenceView.test.ts checks they stay equal to core's.

import type { DisruptionEvent, EnergyPayload } from '@portchimera/core/v2';

export type Tone = 'neutral' | 'info' | 'success' | 'warn' | 'danger';

export const CATEGORY_LABELS = {
  SECURITY_INCIDENT: 'Security incident',
  PIRACY: 'Piracy',
  HIJACKING: 'Hijacking',
  ROUTE_DISRUPTION: 'Route disruption',
  PORT_DISRUPTION: 'Port disruption',
  ENERGY_SUPPLY: 'Energy supply',
  SANCTIONS: 'Sanctions',
  MARINE_WEATHER: 'Marine weather',
} as const;
export type CategoryId = keyof typeof CATEGORY_LABELS;

export const SOURCE_CLASS_LABELS = {
  OFFICIAL_SOURCE: 'Official source',
  MEDIA_REPORT: 'Media report, not confirmed',
  UNVERIFIED_REPORT: 'Unverified report',
} as const;
export type SourceClassId = keyof typeof SOURCE_CLASS_LABELS;

export const SOURCE_CLASS_TONES: Record<SourceClassId, Tone> = {
  OFFICIAL_SOURCE: 'success',
  MEDIA_REPORT: 'info',
  UNVERIFIED_REPORT: 'warn',
};

export const REGION_OPTIONS = [
  { id: 'persian-gulf', label: 'Persian Gulf' },
  { id: 'red-sea', label: 'Red Sea' },
  { id: 'suez', label: 'Suez Canal' },
  { id: 'mediterranean', label: 'Mediterranean' },
  { id: 'south-east-asia', label: 'Malacca and Singapore Straits' },
  { id: 'south-china-sea', label: 'South China Sea and Taiwan Strait' },
  { id: 'north-europe', label: 'English Channel and North Sea' },
  { id: 'southern-africa', label: 'Cape of Good Hope' },
  { id: 'black-sea', label: 'Black Sea' },
] as const;

export const CHOKEPOINT_NAMES: Record<string, string> = {
  malacca: 'Strait of Malacca',
  hormuz: 'Strait of Hormuz',
  'bab-el-mandeb': 'Bab-el-Mandeb',
  suez: 'Suez Canal',
  gibraltar: 'Strait of Gibraltar',
  dover: 'Strait of Dover',
  'cape-good-hope': 'Cape of Good Hope',
  taiwan: 'Taiwan Strait',
  panama: 'Panama Canal',
};

export const RELEVANCE_TONES: Record<DisruptionEvent['relevance'], Tone> = {
  HIGH: 'warn',
  MEDIUM: 'neutral',
  LOW: 'neutral',
};

export const NEWS_PAGE_SIZE = 20;

export interface NewsFilters {
  q?: string;
  region?: string;
  category?: string;
  sourceClass?: string;
  page?: number;
  refresh?: boolean;
}

/** Request path for GET /api/intelligence/news. Empty filters are left out. */
export function buildNewsPath(f: NewsFilters): string {
  const p = new URLSearchParams();
  const q = f.q?.trim();
  if (q) p.set('q', q.slice(0, 100));
  if (f.region) p.set('region', f.region);
  if (f.category) p.set('category', f.category);
  if (f.sourceClass) p.set('sourceClass', f.sourceClass);
  p.set('page', String(Math.max(1, Math.floor(f.page ?? 1))));
  p.set('pageSize', String(NEWS_PAGE_SIZE));
  if (f.refresh) p.set('refresh', 'true');
  return `/api/intelligence/news?${p.toString()}`;
}

/** "just now", "12 min ago", "3 h ago", "2 d ago". */
export function formatAge(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "27 Nov 2026, 10:15 UTC". Always UTC, so it reads the same for everyone. */
export function formatUtc(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

/** "27 Nov 2026" from "2026-11-27". */
export function formatDay(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (m === null) return date;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ''} ${m[1]}`;
}

export interface FreshnessNote {
  readonly tone: Tone;
  readonly title: string;
  readonly text: string;
}

/** What to tell the reader about how fresh the news is. Never says "live". */
export function newsFreshness(meta: {
  fetchedAt: string;
  ageSeconds: number;
  stale: boolean;
  refreshThrottled: boolean;
  queriesFailed: number;
}): FreshnessNote {
  const when = formatUtc(meta.fetchedAt) ?? 'an unknown time';
  if (meta.stale) {
    return {
      tone: 'warn',
      title: 'Showing older data',
      text: `The news source could not be reached, so this list is from ${when} (${formatAge(meta.ageSeconds)}). Newer events may be missing.`,
    };
  }
  if (meta.queriesFailed > 0) {
    return {
      tone: 'warn',
      title: 'Partly updated',
      text: `Some searches failed on the last update (${when}). Some events may be missing.`,
    };
  }
  return {
    tone: 'neutral',
    title: 'Last updated',
    text: `${when} (${formatAge(meta.ageSeconds)}). The list refreshes at most every 15 minutes. This is news discovery, not real-time monitoring.`,
  };
}

export function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}

/** "+1.27%", "-0.50%", "0.00%". */
export function formatPct(pct: number | null): string {
  if (pct === null) return 'n/a';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

export function pctTone(pct: number | null): Tone {
  if (pct === null || pct === 0) return 'neutral';
  return pct > 0 ? 'warn' : 'info';
}

export const TREND_LABELS = {
  UP: 'Up over the last week',
  DOWN: 'Down over the last week',
  FLAT: 'Flat over the last week',
} as const;

export function energyFreshness(
  e: Pick<EnergyPayload, 'stale' | 'dataStale' | 'fetchedAt' | 'summary'>,
): FreshnessNote | null {
  if (e.stale) {
    return {
      tone: 'warn',
      title: 'Showing the last successful value',
      text: `EIA could not be reached. The value below was fetched ${formatUtc(e.fetchedAt) ?? 'earlier'} and may be out of date.`,
    };
  }
  if (e.dataStale && e.summary !== null) {
    return {
      tone: 'warn',
      title: 'The newest price is old',
      text: `EIA's latest published price is for ${formatDay(e.summary.latest.date)} (${e.summary.dataAgeDays} days ago).`,
    };
  }
  return null;
}

export interface ChartGeometry {
  readonly line: string;
  readonly area: string;
  readonly min: number;
  readonly max: number;
  readonly points: ReadonlyArray<{ x: number; y: number; date: string; value: number }>;
}

/** SVG path for a price line. y grows downward, so higher prices are drawn higher up. */
export function buildChart(
  history: ReadonlyArray<{ date: string; value: number }>,
  width: number,
  height: number,
  pad = 8,
): ChartGeometry | null {
  if (history.length < 2) return null;
  const values = history.map((h) => h.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const points = history.map((h, i) => ({
    x: round(pad + (i / (history.length - 1)) * innerW),
    y: round(pad + (1 - (h.value - min) / span) * innerH),
    date: h.date,
    value: h.value,
  }));
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
  const last = points[points.length - 1];
  const first = points[0];
  const area =
    last && first ? `${line} L${last.x} ${height - pad} L${first.x} ${height - pad} Z` : line;
  return { line, area, min, max, points };
}

const round = (n: number): number => Math.round(n * 100) / 100;
