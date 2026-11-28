import {
  classifyCategory,
  classifySource,
  hasClosureLanguage,
  matchGeography,
  matchPorts,
  scoreRelevance,
} from './classify.ts';
import { hostnameOf, normalizeUrl, stableId } from './url.ts';
import type { DisruptionEvent } from './types.ts';

/** GDELT DOC 2.0 allows up to 75 records per request in the verified parameter set. */
export const GDELT_MAX_RECORDS = 75;
const GDELT_ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc';
const MAX_TITLE = 300;

/** Topic queries. Each is one request; the service runs few of them and caches the result. */
export const GDELT_TOPIC_QUERIES: readonly string[] = Object.freeze([
  '(tanker OR "cargo ship" OR "container ship" OR vessel) (attack OR hijack OR seized OR piracy OR pirates OR missile OR drone) sourcelang:english',
  '("Red Sea" OR "Strait of Hormuz" OR "Suez Canal" OR "Bab el-Mandeb" OR "Gulf of Aden" OR "Strait of Malacca" OR "Taiwan Strait") (shipping OR vessel OR tanker OR maritime) sourcelang:english',
  '(port OR terminal) (strike OR congestion OR closed OR closure) (shipping OR container OR cargo) sourcelang:english',
  '(shipping OR tanker) (sanctions OR typhoon OR cyclone OR "oil export") sourcelang:english',
]);

/** URL for one GDELT article-list request. No key is needed. */
export function buildGdeltUrl(
  query: string,
  opts: { maxRecords?: number; timespan?: string } = {},
): string {
  const max = Math.min(
    GDELT_MAX_RECORDS,
    Math.max(1, Math.floor(opts.maxRecords ?? GDELT_MAX_RECORDS)),
  );
  const timespan = /^\d{1,3}(min|h|d|w|m)$/.test(opts.timespan ?? '')
    ? (opts.timespan as string)
    : '3d';
  const params = new URLSearchParams({
    query,
    mode: 'ArtList',
    format: 'json',
    sort: 'DateDesc',
    maxrecords: String(max),
    timespan,
  });
  return `${GDELT_ENDPOINT}?${params.toString()}`;
}

/** "20261128T101500Z" -> "2026-11-28T10:15:00Z". Anything else -> null. */
export function parseSeenDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (m === null) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
  const t = Date.parse(iso);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 19) === iso.slice(0, 19)
    ? iso
    : null;
}

/** Plain text only: control characters and angle brackets removed, spaces collapsed, length capped. */
export function cleanText(value: string, max = MAX_TITLE): string {
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max)
  );
}

export interface ParsedEvents {
  readonly events: DisruptionEvent[];
  /** Items that were not objects, or had no usable title or URL. */
  readonly malformed: number;
  /** Valid items that are not about shipping disruption. */
  readonly irrelevant: number;
}

/**
 * Turns a GDELT ArtList payload into events. The payload is untrusted: every field is checked,
 * unusable items are counted, and nothing from the text is ever executed or followed. If the
 * payload is not the expected shape, `malformed` is -1 so the caller can treat it as a failure.
 */
export function parseGdeltArticles(
  payload: unknown,
  retrievedAt: string,
  ports: ReadonlyArray<{ code: string; name: string }> = [],
): ParsedEvents {
  const articles = (payload as { articles?: unknown } | null)?.articles;
  if (!Array.isArray(articles)) return { events: [], malformed: -1, irrelevant: 0 };

  const events: DisruptionEvent[] = [];
  let malformed = 0;
  let irrelevant = 0;

  for (const raw of articles) {
    const a = raw as {
      url?: unknown;
      title?: unknown;
      seendate?: unknown;
      domain?: unknown;
    } | null;
    if (
      a === null ||
      typeof a !== 'object' ||
      typeof a.url !== 'string' ||
      typeof a.title !== 'string'
    ) {
      malformed += 1;
      continue;
    }
    const normalized = normalizeUrl(a.url);
    const headline = cleanText(a.title);
    if (normalized === null || headline === '') {
      malformed += 1;
      continue;
    }
    const category = classifyCategory(headline);
    if (category === null) {
      irrelevant += 1;
      continue;
    }
    const geo = matchGeography(headline);
    const portCodes = matchPorts(headline, ports);
    const domain =
      typeof a.domain === 'string' && a.domain !== ''
        ? cleanText(a.domain, 100)
        : (hostnameOf(a.url) ?? 'unknown');
    events.push({
      id: stableId(normalized),
      headline,
      source: domain,
      url: a.url.trim(),
      publishedAt: parseSeenDate(a.seendate),
      retrievedAt,
      region: geo.regionName,
      regionIds: geo.regionIds,
      category,
      summary: '',
      sourceClass: classifySource(a.url, 'aggregator'),
      relevance: scoreRelevance(category, geo, portCodes),
      location: geo.location,
      chokepointIds: geo.chokepointIds,
      portCodes,
      closureLanguage: hasClosureLanguage(headline),
    });
  }
  return { events, malformed, irrelevant };
}
