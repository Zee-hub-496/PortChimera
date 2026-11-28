import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENERGY_TTL_MS,
  createEnergyService,
} from '../../src/modules/intelligence/energyService.ts';
import { ProviderError } from '../../src/modules/intelligence/providerHttp.ts';
import { fakeFetch, noSleep, recordingLogger, reply } from './fakes.ts';

const SECRET = 'SECRET-KEY-123';
const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    period: new Date(Date.UTC(2026, 10, 27 - i)).toISOString().slice(0, 10),
    series: 'RBRTE',
    value: String(80 - i * 0.5),
    units: '$/BBL',
  }));
const GOOD = { response: { data: rows(30) } };

function setup(script: Parameters<typeof fakeFetch>[0], ...keyArg: [] | [string | undefined]) {
  const apiKey = keyArg.length === 0 ? SECRET : keyArg[0];
  const f = fakeFetch(script);
  const clock = { t: Date.parse('2026-11-28T09:00:00Z') };
  const logger = recordingLogger();
  const service = createEnergyService({
    apiKey,
    fetchImpl: f.fetchImpl,
    now: () => clock.t,
    sleep: noSleep,
    retries: 0,
    logger,
  });
  return { f, clock, service, logger };
}

test('without a key it says not configured and calls nothing', async () => {
  const { service, f } = setup(() => reply(200, GOOD), undefined);
  const r = await service.getEnergy();
  assert.equal(r.state, 'NOT_CONFIGURED');
  assert.equal(r.summary, null);
  assert.deepEqual(r.history, []);
  assert.equal(f.calls.length, 0);
});

test('returns real values from the response with unit, dates and history oldest first', async () => {
  const { service } = setup(() => reply(200, GOOD));
  const r = await service.getEnergy();
  assert.equal(r.state, 'OK');
  assert.equal(r.unit, 'USD per barrel');
  assert.equal(r.summary?.latest.date, '2026-11-27');
  assert.equal(r.summary?.latest.value, 80);
  assert.equal(r.summary?.dailyChangePct, 0.63);
  assert.equal(r.history.length, 30);
  assert.ok((r.history[0]?.date ?? '') < (r.history[29]?.date ?? ''));
  assert.equal(r.stale, false);
  assert.equal(r.dataStale, false);
  assert.match(r.note, /not a freight rate/);
});

test('the key is sent to EIA but never appears in results, errors or logs', async () => {
  const ok = setup(() => reply(200, GOOD));
  const r = await ok.service.getEnergy();
  assert.ok(ok.f.calls[0]?.includes(`api_key=${SECRET}`));
  assert.doesNotMatch(JSON.stringify(r), new RegExp(SECRET));

  const bad = setup(() => reply(500, 'x', true));
  let message = '';
  try {
    await bad.service.getEnergy();
  } catch (e) {
    message = String((e as Error).message);
  }
  assert.doesNotMatch(message, new RegExp(SECRET));
  assert.doesNotMatch(JSON.stringify(bad.logger.logged), new RegExp(SECRET));
});

test('cached inside the TTL, refetched after it', async () => {
  const { service, f, clock } = setup(() => reply(200, GOOD));
  await service.getEnergy();
  clock.t += ENERGY_TTL_MS - 1;
  await service.getEnergy();
  assert.equal(f.calls.length, 1);
  clock.t += 2;
  await service.getEnergy();
  assert.equal(f.calls.length, 2);
});

test('when EIA fails later, the last good value is shown with its original timestamp and stale flag', async () => {
  let fail = false;
  const { service, clock } = setup(() => (fail ? reply(503, 'x', true) : reply(200, GOOD)));
  const first = await service.getEnergy();
  fail = true;
  clock.t += ENERGY_TTL_MS + 1;
  const r = await service.getEnergy();
  assert.equal(r.stale, true);
  assert.equal(r.lastError, 'HTTP_ERROR');
  assert.equal(r.fetchedAt, first.fetchedAt);
  assert.equal(r.summary?.latest.value, 80);
});

test('with no cache and EIA down, it throws and invents nothing', async () => {
  const { service } = setup(() => reply(503, 'x', true));
  await assert.rejects(service.getEnergy(), (e: unknown) => e instanceof ProviderError);
});

test('malformed responses are failures, not empty data', async () => {
  for (const body of [
    { error: 'API_KEY_INVALID' },
    { response: { data: [] } },
    { response: { data: [{ period: 'x', value: 'y' }] } },
    '<html>',
  ]) {
    const { service } = setup(() => reply(200, body, typeof body === 'string'));
    await assert.rejects(service.getEnergy(), `body: ${JSON.stringify(body)}`);
  }
});

test('old market data is flagged dataStale even when the fetch just worked', async () => {
  const old = {
    response: {
      data: [
        { period: '2026-11-01', value: '77' },
        { period: '2026-10-31', value: '76' },
      ],
    },
  };
  const { service } = setup(() => reply(200, old));
  const r = await service.getEnergy();
  assert.equal(r.stale, false);
  assert.equal(r.dataStale, true);
});
