import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';

// These tests start the real app on a random free port and call it with fetch.
// They need `npm install` first (Express, Zod, Helmet), so they run on your machine or in CI.

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv({});
    assert.equal(env.PORT, 4000);
    assert.equal(env.CORS_ORIGIN, 'http://localhost:5173');
  });

  it('rejects an invalid PORT and names the variable', () => {
    assert.throws(() => loadEnv({ PORT: 'not-a-number' }), /PORT/);
  });

  it('does not echo secret values in its error message', () => {
    assert.throws(
      () => loadEnv({ PORT: 'abc', GEMINI_API_KEY: 'super-secret-value' }),
      (err) => !err.message.includes('super-secret-value'),
    );
  });

  it('defaults TRUST_PROXY_HOPS to 1 and rejects bad values', () => {
    assert.equal(loadEnv({}).TRUST_PROXY_HOPS, 1);
    assert.equal(loadEnv({ TRUST_PROXY_HOPS: '2' }).TRUST_PROXY_HOPS, 2);
    assert.throws(() => loadEnv({ TRUST_PROXY_HOPS: '-1' }), /TRUST_PROXY_HOPS/);
  });

  it('returns a frozen object', () => {
    assert.ok(Object.isFrozen(loadEnv({})));
  });
});

describe('API foundation', () => {
  let server;
  let base;

  before(async () => {
    const app = createApp(loadEnv({ NODE_ENV: 'test' }), { logger: { error: mock.fn() } });
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  it('GET /api/health returns ok in the standard envelope', async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { data: { status: 'ok', service: 'portchimera-api' } });
  });

  it('sets security headers and hides the framework', async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.headers.get('x-powered-by'), null);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });

  it('returns a 404 error envelope for unknown routes', async () => {
    const res = await fetch(`${base}/api/nope`);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error.code, 'NOT_FOUND');
  });

  it('returns 400 for malformed JSON without leaking a stack trace', async () => {
    const res = await fetch(`${base}/api/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ bad json',
    });
    assert.equal(res.status, 400);
    const text = await res.text();
    assert.match(text, /INVALID_JSON/);
    assert.doesNotMatch(text, /node_modules|\.js:\d+/);
  });
});

describe('rate limit keys behind a proxy', () => {
  let server;
  let base;

  before(async () => {
    const app = createApp(loadEnv({ NODE_ENV: 'test', TRUST_PROXY_HOPS: '1' }), {
      logger: { error: mock.fn() },
      rateLimitMax: 2,
    });
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  const hit = (xff) => fetch(`${base}/api/health`, { headers: { 'X-Forwarded-For': xff } });

  it('gives each client IP its own bucket', async () => {
    assert.equal((await hit('203.0.113.1')).status, 200);
    assert.equal((await hit('203.0.113.1')).status, 200);
    assert.equal((await hit('203.0.113.1')).status, 429);
    // A different client is not affected by the first one being limited.
    assert.equal((await hit('203.0.113.2')).status, 200);
  });

  it('ignores extra addresses a client puts at the front of X-Forwarded-For', async () => {
    // With one trusted hop, only the rightmost entry (added by the proxy) is the key.
    assert.equal((await hit('1.1.1.1, 203.0.113.3')).status, 200);
    assert.equal((await hit('2.2.2.2, 203.0.113.3')).status, 200);
    assert.equal((await hit('3.3.3.3, 203.0.113.3')).status, 429);
  });
});
