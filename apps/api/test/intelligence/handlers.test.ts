import test from 'node:test';
import assert from 'node:assert/strict';
import { intelligenceHandlers } from '../../src/modules/intelligence/handlers.ts';
import { newsQuerySchema } from '../../src/modules/intelligence/schemas.ts';
import { intelligenceRouter } from '../../src/modules/intelligence/routes.ts';
import { AppError } from '../../src/middleware/errorHandler.js';
import { makeParser } from '../../src/modules/shipments/schemas.js';
import { createNewsService } from '../../src/modules/intelligence/newsService.ts';
import { ProviderError } from '../../src/modules/intelligence/providerHttp.ts';
import type { NewsService } from '../../src/modules/intelligence/newsService.ts';
import type { EnergyService } from '../../src/modules/intelligence/energyService.ts';
import { fakeFetch, gdeltPayload, noSleep, reply, silentLogger } from './fakes.ts';

const parse = makeParser(newsQuerySchema, AppError);
const res = () => {
  const r: { body: unknown; json(b: unknown): void } = {
    body: undefined,
    json(b) {
      r.body = b;
    },
  };
  return r;
};

const GOOD = gdeltPayload([
  ['Tanker attacked in the Strait of Hormuz', 'https://news.example.com/a'],
  ['Dockworkers strike at Rotterdam port', 'https://news.example.com/b'],
]);

function handlers(opts: { news?: NewsService; energy?: EnergyService } = {}) {
  const f = fakeFetch(() => reply(200, GOOD));
  const news =
    opts.news ??
    createNewsService({
      fetchImpl: f.fetchImpl,
      sleep: noSleep,
      queries: ['q'],
      logger: silentLogger,
    });
  const energy = opts.energy ?? {
    getEnergy: async () => {
      throw new ProviderError('NETWORK', 'x');
    },
  };
  return intelligenceHandlers({ news, energy, parseNewsQuery: parse });
}

test('query schema: defaults, coercion and limits', () => {
  assert.deepEqual(parse({}), { page: 1, pageSize: 20, refresh: false });
  assert.equal(parse({ page: '3', pageSize: '50' }).page, 3);
  assert.equal(parse({ refresh: 'true' }).refresh, true);
  assert.equal(parse({ q: '  hormuz  ' }).q, 'hormuz');
});

test('query schema rejects bad input with 422', () => {
  for (const bad of [
    { pageSize: '51' },
    { page: '0' },
    { category: 'NOPE' },
    { region: 'atlantis' },
    { q: 'x'.repeat(101) },
    { extra: '1' },
    { refresh: 'maybe' },
  ]) {
    assert.throws(
      () => parse(bad),
      (e: unknown) => e instanceof AppError && e.status === 422,
      JSON.stringify(bad),
    );
  }
});

test('GET news returns the {data} envelope with items, paging and honest meta', async () => {
  const r = res();
  await handlers().news({ query: { pageSize: '1' } }, r);
  const data = (r.body as { data: Record<string, any> }).data;
  assert.equal(data.items.length, 1);
  assert.equal(data.total, 2);
  assert.equal(data.totalPages, 2);
  assert.equal(data.meta.stale, false);
  assert.equal(data.meta.ttlSeconds, 900);
  assert.match(data.meta.source, /not real time/);
  assert.ok(data.meta.fetchedAt);
  assert.equal(data.meta.officialLinks.length, 3);
  assert.ok(data.meta.officialLinks.every((l: { url: string }) => l.url.startsWith('https://')));
});

test('GET news with an invalid query is a 422 and calls no provider', async () => {
  const f = fakeFetch(() => reply(200, GOOD));
  const news = createNewsService({ fetchImpl: f.fetchImpl, queries: ['q'], logger: silentLogger });
  await assert.rejects(
    handlers({ news }).news({ query: { category: 'x' } }, res()),
    (e: unknown) => e instanceof AppError && e.status === 422,
  );
  assert.equal(f.calls.length, 0);
});

test('provider failure without cache becomes a 503 PROVIDER_UNAVAILABLE with no internals', async () => {
  const f = fakeFetch(() => reply(500, 'secret internal detail', true));
  const news = createNewsService({
    fetchImpl: f.fetchImpl,
    sleep: noSleep,
    retries: 0,
    queries: ['q'],
    logger: silentLogger,
  });
  await assert.rejects(handlers({ news }).news({ query: {} }, res()), (e: unknown) => {
    assert.ok(e instanceof AppError);
    assert.equal(e.status, 503);
    assert.equal(e.code, 'PROVIDER_UNAVAILABLE');
    assert.doesNotMatch(e.message, /secret|gdelt|http/i);
    return true;
  });
});

test('GET energy passes the service result through, and a provider failure is a 503', async () => {
  const ok: EnergyService = {
    getEnergy: async () => ({
      state: 'NOT_CONFIGURED',
      series: 'RBRTE',
      label: 'l',
      unit: 'u',
      summary: null,
      history: [],
      fetchedAt: null,
      stale: false,
      dataStale: false,
      lastError: null,
      note: 'n',
    }),
  };
  const r = res();
  await handlers({ energy: ok }).energy({ query: {} }, r);
  assert.equal((r.body as { data: { state: string } }).data.state, 'NOT_CONFIGURED');
  await assert.rejects(
    handlers().energy({ query: {} }, res()),
    (e: unknown) => e instanceof AppError && e.status === 503,
  );
});

test('the router exposes exactly /news and /energy, behind its own rate limit', () => {
  const router = intelligenceRouter({
    env: {},
    logger: console as Console,
    fetchImpl: fakeFetch(() => reply(200, GOOD)).fetchImpl,
  });
  const routes = (
    router as unknown as {
      stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }>;
    }
  ).stack
    .filter((l) => l.route)
    .map((l) => `${Object.keys(l.route!.methods)[0]} ${l.route!.path}`);
  assert.deepEqual(routes.sort(), ['get /energy', 'get /news']);
});
