import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { fakeDbFactory, fakeVerifier } from './helpers/fakes.js';

// Runs the REAL Express app with a fake sign-in service and a fake database.
// Needs `npm install` (Express, Zod, Helmet), so it runs on your machine, not in the authoring sandbox.

const profiles = [
  { owner: 'user-alice', id: 'user-alice', display_name: 'Alice' },
  { owner: 'user-bob', id: 'user-bob', display_name: 'Bob' },
];

describe('auth routes through the real app', () => {
  let server;
  let base;

  before(async () => {
    const factory = fakeDbFactory({ profiles });
    const app = createApp(loadEnv({ NODE_ENV: 'test' }), {
      logger: { error: mock.fn() },
      auth: { verifyToken: fakeVerifier(), createDb: factory.createDb },
    });
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  const get = (path, token) =>
    fetch(`${base}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

  it('keeps /api/health public', async () => {
    assert.equal((await get('/api/health')).status, 200);
  });

  it('refuses /api/auth/me without a token, in the standard error envelope', async () => {
    const res = await get('/api/auth/me');
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error.code, 'UNAUTHENTICATED');
  });

  it('refuses an invalid token', async () => {
    assert.equal((await get('/api/auth/me', 'forged-token')).status, 401);
  });

  it("returns Alice's own profile for Alice's token", async () => {
    const res = await get('/api/auth/me', 'alice-token');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      data: { id: 'user-alice', email: 'alice@example.test', displayName: 'Alice' },
    });
  });

  it("returns Bob's own profile for Bob's token", async () => {
    const body = await (await get('/api/auth/me', 'bob-token')).json();
    assert.equal(body.data.id, 'user-bob');
    assert.equal(body.data.displayName, 'Bob');
  });

  it('never echoes the token back', async () => {
    const text = await (await get('/api/auth/me', 'alice-token')).text();
    assert.doesNotMatch(text, /alice-token/);
  });

  it('puts the sign-in check in front of every /api/auth path, even ones that do not exist', async () => {
    assert.equal((await get('/api/auth/anything')).status, 401);
    assert.equal((await get('/api/auth/anything', 'alice-token')).status, 404);
  });

  it('does not mount protected routes at all when no auth is configured', async () => {
    const app = createApp(loadEnv({ NODE_ENV: 'test' }), { logger: { error: mock.fn() } });
    const bare = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    try {
      const res = await fetch(`http://127.0.0.1:${bare.address().port}/api/auth/me`);
      assert.equal(res.status, 404);
    } finally {
      await new Promise((resolve) => bare.close(resolve));
    }
  });
});
