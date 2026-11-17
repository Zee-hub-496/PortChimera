import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeSupabaseVerifier } from '../src/middleware/supabaseVerifier.js';

const clientReturning = (result) => ({ auth: { getUser: async () => result } });
const authError = (status, name = 'AuthApiError') =>
  Object.assign(new Error('boom'), { status, name });

describe('makeSupabaseVerifier', () => {
  it('returns the user for a valid token', async () => {
    const verify = makeSupabaseVerifier(
      clientReturning({
        data: { user: { id: 'u1', email: 'a@example.test', role: 'authenticated' } },
        error: null,
      }),
    );
    assert.deepEqual(await verify('t'), { id: 'u1', email: 'a@example.test' });
  });

  it('passes the token to Supabase unchanged', async () => {
    let seen;
    const verify = makeSupabaseVerifier({
      auth: {
        getUser: async (token) => {
          seen = token;
          return { data: { user: { id: 'u1' } }, error: null };
        },
      },
    });
    await verify('the-token');
    assert.equal(seen, 'the-token');
  });

  it('returns null when Supabase rejects the token (400, 401, 403)', async () => {
    for (const status of [400, 401, 403]) {
      const verify = makeSupabaseVerifier(
        clientReturning({ data: { user: null }, error: authError(status) }),
      );
      assert.equal(await verify('t'), null, `status ${status}`);
    }
  });

  it('returns null when no user comes back, and fills a missing email with null', async () => {
    assert.equal(
      await makeSupabaseVerifier(clientReturning({ data: { user: null }, error: null }))('t'),
      null,
    );
    assert.equal(
      await makeSupabaseVerifier(clientReturning({ data: null, error: null }))('t'),
      null,
    );
    const verify = makeSupabaseVerifier(
      clientReturning({ data: { user: { id: 'u1' } }, error: null }),
    );
    assert.deepEqual(await verify('t'), { id: 'u1', email: null });
  });

  it('throws, instead of returning null, when the service is failing or unreachable', async () => {
    for (const error of [
      authError(500),
      authError(503),
      authError(0, 'AuthRetryableFetchError'),
      authError(undefined, 'AuthRetryableFetchError'),
    ]) {
      const verify = makeSupabaseVerifier(clientReturning({ data: { user: null }, error }));
      await assert.rejects(verify('t'), (err) => err === error);
    }
  });

  it('does not pass through extra fields from the Supabase user', async () => {
    const verify = makeSupabaseVerifier(
      clientReturning({
        data: { user: { id: 'u1', email: 'a@x.test', app_metadata: { secret: 1 }, phone: '123' } },
        error: null,
      }),
    );
    assert.deepEqual(Object.keys(await verify('t')).sort(), ['email', 'id']);
  });
});
