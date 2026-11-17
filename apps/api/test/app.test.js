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
