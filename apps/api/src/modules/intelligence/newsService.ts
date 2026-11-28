import {
  GDELT_TOPIC_QUERIES,
  buildGdeltUrl,
  dedupe,
  parseGdeltArticles,
} from '@portchimera/core/v2';
import type { DisruptionEvent } from '@portchimera/core/v2';
import { ProviderError, defaultSleep, fetchJson } from './providerHttp.ts';
import type { FetchLike } from './providerHttp.ts';

export const NEWS_TTL_MS = 15 * 60 * 1000;
/** A manual refresh inside this window is answered from the cache, so a user cannot hammer GDELT. */
export const NEWS_MIN_REFRESH_MS = 60 * 1000;
const MAX_EVENTS = 300;

export interface NewsSnapshot {
  readonly events: readonly DisruptionEvent[];
  readonly fetchedAt: string;
  readonly queriesOk: number;
  readonly queriesFailed: number;
  readonly malformed: number;
  readonly irrelevant: number;
}

export interface NewsResult extends NewsSnapshot {
  /** True when the data is older than the cache lifetime because a refresh failed. */
  readonly stale: boolean;
  readonly ageSeconds: number;
  /** Set when a refresh failed and older data is shown. A short code, never a URL. */
  readonly lastError: string | null;
  readonly refreshThrottled: boolean;
}

export interface NewsServiceDeps {
  fetchImpl: FetchLike;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  ttlMs?: number;
  timeoutMs?: number;
  retries?: number;
  logger?: { warn(...a: unknown[]): void };
  queries?: readonly string[];
}

export interface NewsService {
  getNews(opts?: { force?: boolean }): Promise<NewsResult>;
}

const time = (e: DisruptionEvent): number =>
  e.publishedAt === null ? 0 : Date.parse(e.publishedAt);

/** Newest first; undated last. Official-source items win ties so duplicates keep the official one. */
export function sortEvents(events: readonly DisruptionEvent[]): DisruptionEvent[] {
  return [...events].sort((a, b) => {
    const d = time(b) - time(a);
    if (d !== 0) return d;
    return (
      Number(b.sourceClass === 'OFFICIAL_SOURCE') - Number(a.sourceClass === 'OFFICIAL_SOURCE')
    );
  });
}

export function createNewsService(deps: NewsServiceDeps): NewsService {
  const now = deps.now ?? Date.now;
  const ttl = deps.ttlMs ?? NEWS_TTL_MS;
  const logger = deps.logger ?? console;
  const queries = deps.queries ?? GDELT_TOPIC_QUERIES;
  const http = {
    fetchImpl: deps.fetchImpl,
    timeoutMs: deps.timeoutMs ?? 8000,
    retries: deps.retries ?? 1,
    backoffMs: 500,
    maxBytes: 2_000_000,
    sleep: deps.sleep ?? defaultSleep,
  };

  let cache: { snapshot: NewsSnapshot; at: number } | null = null;
  let inFlight: Promise<NewsSnapshot | { error: string }> | null = null;
  /** After a failed refresh, wait before asking the providers again. */
  let failure: { at: number; code: string } | null = null;

  async function refresh(): Promise<NewsSnapshot | { error: string }> {
    const retrievedAt = new Date(now()).toISOString();
    const all: DisruptionEvent[] = [];
    let ok = 0;
    let failed = 0;
    let malformed = 0;
    let irrelevant = 0;
    let lastCode = 'UNAVAILABLE';
    // One request at a time: gentle on a free public API.
    for (const q of queries) {
      try {
        const payload = await fetchJson(buildGdeltUrl(q, { timespan: '3d' }), http);
        const parsed = parseGdeltArticles(payload, retrievedAt);
        if (parsed.malformed < 0)
          throw new ProviderError('BAD_PAYLOAD', 'Unexpected response shape');
        all.push(...parsed.events);
        malformed += parsed.malformed;
        irrelevant += parsed.irrelevant;
        ok += 1;
      } catch (err) {
        failed += 1;
        lastCode = err instanceof ProviderError ? err.code : 'UNAVAILABLE';
        logger.warn('news_query_failed', { code: lastCode });
      }
    }
    if (ok === 0) return { error: lastCode };
    const events = dedupe(sortEvents(all)).slice(0, MAX_EVENTS);
    return {
      events,
      fetchedAt: retrievedAt,
      queriesOk: ok,
      queriesFailed: failed,
      malformed,
      irrelevant,
    };
  }

  return {
    async getNews({ force = false } = {}) {
      const t = now();
      const view = (
        s: NewsSnapshot,
        at: number,
        extra: Partial<Pick<NewsResult, 'stale' | 'lastError' | 'refreshThrottled'>>,
      ): NewsResult => ({
        ...s,
        stale: extra.stale ?? false,
        lastError: extra.lastError ?? null,
        refreshThrottled: extra.refreshThrottled ?? false,
        ageSeconds: Math.max(0, Math.round((t - at) / 1000)),
      });

      if (cache !== null) {
        const age = t - cache.at;
        if (age < ttl && !force) return view(cache.snapshot, cache.at, {});
        if (force && age < NEWS_MIN_REFRESH_MS)
          return view(cache.snapshot, cache.at, { refreshThrottled: true });
      }

      const fail = (code: string): NewsResult => {
        if (cache !== null) return view(cache.snapshot, cache.at, { stale: true, lastError: code });
        throw new ProviderError(
          code === 'TIMEOUT' ? 'TIMEOUT' : 'NETWORK',
          'No maritime news is available right now',
        );
      };
      if (failure !== null && t - failure.at < NEWS_MIN_REFRESH_MS) return fail(failure.code);

      inFlight ??= refresh().finally(() => {
        inFlight = null;
      });
      const result = await inFlight;
      if ('error' in result) {
        failure = { at: now(), code: result.error };
        return fail(result.error);
      }
      failure = null;
      cache = { snapshot: result, at: Date.parse(result.fetchedAt) };
      return view(result, cache.at, {});
    },
  };
}

// ---------- filtering and paging (pure) ----------

export interface NewsFilter {
  q?: string | undefined;
  region?: string | undefined;
  category?: string | undefined;
  sourceClass?: string | undefined;
  page: number;
  pageSize: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function filterEvents(
  events: readonly DisruptionEvent[],
  f: NewsFilter,
): Page<DisruptionEvent> {
  const terms = (f.q ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t !== '');
  const matched = events.filter((e) => {
    if (f.region !== undefined && !e.regionIds.includes(f.region)) return false;
    if (f.category !== undefined && e.category !== f.category) return false;
    if (f.sourceClass !== undefined && e.sourceClass !== f.sourceClass) return false;
    if (terms.length === 0) return true;
    const hay = `${e.headline} ${e.source} ${e.region ?? ''}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
  const totalPages = Math.max(1, Math.ceil(matched.length / f.pageSize));
  const page = Math.min(Math.max(1, f.page), totalPages);
  const start = (page - 1) * f.pageSize;
  return {
    items: matched.slice(start, start + f.pageSize),
    total: matched.length,
    page,
    pageSize: f.pageSize,
    totalPages,
  };
}
