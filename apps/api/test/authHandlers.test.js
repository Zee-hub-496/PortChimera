import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getMe } from '../src/modules/auth/handlers.js';
import { AppError } from '../src/middleware/errorHandler.js';
import { fakeDbFactory, fakeRes } from './helpers/fakes.js';

const profiles = [
  { owner: 'user-alice', id: 'user-alice', display_name: 'Alice' },
  { owner: 'user-bob', id: 'user-bob', display_name: 'Bob' },
];

function requestFor(token, userId, email, factory) {
  return { auth: { userId, email }, db: factory.createDb(token) };
}

describe('GET /api/auth/me handler', () => {
  it("returns the caller's id, email and display name, and nothing else", async () => {
    const factory = fakeDbFactory({ profiles });
    const res = fakeRes();
    await getMe(requestFor('alice-token', 'user-alice', 'alice@example.test', factory), res);
    assert.deepEqual(res.body, {
      data: { id: 'user-alice', email: 'alice@example.test', displayName: 'Alice' },
    });
    assert.deepEqual(Object.keys(res.body.data).sort(), ['displayName', 'email', 'id']);
  });

  it('gives each user only their own profile', async () => {
    const factory = fakeDbFactory({ profiles });
    const bobRes = fakeRes();
    await getMe(requestFor('bob-token', 'user-bob', 'bob@example.test', factory), bobRes);
    assert.equal(bobRes.body.data.displayName, 'Bob');
  });

  it("only ever asks for the caller's own row", async () => {
    const factory = fakeDbFactory({ profiles });
    await getMe(requestFor('alice-token', 'user-alice', 'a@x.test', factory), fakeRes());
    assert.equal(factory.queries.length, 1);
    assert.equal(factory.queries[0].filters.id, 'user-alice');
    assert.equal(factory.queries[0].actingAs, 'user-alice');
  });

  it("cannot reveal another user's profile even if the id were wrong (the database itself refuses)", async () => {
    // Simulates a bug: Bob's client is asked for Alice's id. The fake behaves like Row Level
    // Security, so the row is invisible and the handler reports no display name.
    const factory = fakeDbFactory({ profiles });
    const res = fakeRes();
    await getMe(
      { auth: { userId: 'user-alice', email: 'a@x.test' }, db: factory.createDb('bob-token') },
      res,
    );
    assert.equal(res.body.data.displayName, null);
  });

  it('returns a null display name when there is no profile row', async () => {
    const factory = fakeDbFactory({ profiles: [] });
    const res = fakeRes();
    await getMe(requestFor('alice-token', 'user-alice', 'a@x.test', factory), res);
    assert.equal(res.body.data.displayName, null);
  });

  it('turns a database failure into a safe error without database details', async () => {
    const factory = fakeDbFactory({ profiles });
    factory.failNextWith({ message: 'relation "profiles" does not exist at /var/db/secret' });
    await assert.rejects(
      getMe(requestFor('alice-token', 'user-alice', 'a@x.test', factory), fakeRes()),
      (err) =>
        err instanceof AppError && err.status === 500 && !/secret|relation/.test(err.message),
    );
  });
});
