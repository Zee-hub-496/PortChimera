import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { requireAuth } from '../src/middleware/requireAuth.js';
import { AppError } from '../src/middleware/errorHandler.js';
import { fakeDbFactory, fakeReq, fakeVerifier } from './helpers/fakes.js';

const silent = () => ({ error: mock.fn() });

function setup(options = {}) {
  const verifyToken = fakeVerifier(options);
  const db = fakeDbFactory();
  const createDb = mock.fn(db.createDb);
  const logger = silent();
  const authenticate = requireAuth({ verifyToken, createDb, logger });
  return { authenticate, verifyToken, createDb, logger };
}

const run = async (authenticate, headers) => {
  const req = fakeReq(headers);
  const next = mock.fn();
  await authenticate(req, {}, next);
  return { req, next };
};

const rejects = (promise, status, code) =>
  assert.rejects(
    promise,
    (err) => err instanceof AppError && err.status === status && err.code === code,
  );

describe('requireAuth: requests that must be refused', () => {
  it('refuses a request with no Authorization header (401)', async () => {
    const { authenticate, verifyToken } = setup();
    await rejects(run(authenticate, {}), 401, 'UNAUTHENTICATED');
    assert.equal(verifyToken.calls.length, 0, 'no token means nothing to verify');
  });

  it('refuses other schemes, empty tokens and malformed headers', async () => {
    const { authenticate, verifyToken } = setup();
    for (const header of [
      'Basic YWxpY2U6cHc=',
      'Bearer',
      'Bearer   ',
      'Bearer a b',
      'alice-token',
      'Token alice-token',
      '',
    ]) {
      await rejects(run(authenticate, { Authorization: header }), 401, 'UNAUTHENTICATED');
    }
    assert.equal(verifyToken.calls.length, 0);
  });

  it('refuses an invalid or expired token (401) and builds no database client', async () => {
    const { authenticate, createDb } = setup();
    await rejects(
      run(authenticate, { Authorization: 'Bearer not-a-real-token' }),
      401,
      'UNAUTHENTICATED',
    );
    assert.equal(createDb.mock.callCount(), 0);
  });

  it('answers 503, not 401, when the sign-in service is down, and logs no token', async () => {
    const { authenticate, logger } = setup({ down: true });
    await rejects(
      run(authenticate, { Authorization: 'Bearer alice-token' }),
      503,
      'AUTH_UNAVAILABLE',
    );
    assert.equal(logger.error.mock.callCount(), 1);
    assert.doesNotMatch(JSON.stringify(logger.error.mock.calls[0].arguments), /alice-token/);
  });
});

describe('requireAuth: a valid sign-in', () => {
  it('attaches the user and a database client built for that exact token, then continues', async () => {
    const { authenticate, createDb, verifyToken } = setup();
    const { req, next } = await run(authenticate, { Authorization: 'Bearer alice-token' });
    assert.deepEqual({ ...req.auth }, { userId: 'user-alice', email: 'alice@example.test' });
    assert.equal(next.mock.callCount(), 1);
    assert.deepEqual(createDb.mock.calls[0].arguments, ['alice-token']);
    assert.deepEqual(verifyToken.calls, ['alice-token']);
    assert.ok(req.db);
  });

  it('gives each caller their own identity (no mixing between users)', async () => {
    const { authenticate } = setup();
    const alice = await run(authenticate, { Authorization: 'Bearer alice-token' });
    const bob = await run(authenticate, { Authorization: 'Bearer bob-token' });
    assert.equal(alice.req.auth.userId, 'user-alice');
    assert.equal(bob.req.auth.userId, 'user-bob');
  });

  it('accepts "bearer" in any letter case', async () => {
    const { authenticate } = setup();
    const { req } = await run(authenticate, { authorization: 'bearer alice-token' });
    assert.equal(req.auth.userId, 'user-alice');
  });

  it('does not keep the token on req.auth, and freezes it', async () => {
    const { authenticate } = setup();
    const { req } = await run(authenticate, { Authorization: 'Bearer alice-token' });
    assert.doesNotMatch(JSON.stringify(req.auth), /alice-token/);
    assert.throws(() => {
      'use strict';
      req.auth.userId = 'user-bob';
    }, TypeError);
  });
});

describe('requireAuth: setup', () => {
  it('refuses to be built without its two dependencies', () => {
    assert.throws(() => requireAuth({}), TypeError);
    assert.throws(() => requireAuth({ verifyToken: () => {} }), TypeError);
  });
});
