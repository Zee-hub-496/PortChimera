// Fakes for testing auth and ownership rules without a network, Express or a real Supabase project.

/** The minimal slice of an Express request that our middleware reads. */
export function fakeReq(headers = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name) => lower[name.toLowerCase()], headers: lower };
}

/** Records what a handler sends back. */
export function fakeRes() {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

export const USERS = Object.freeze({
  'alice-token': { id: 'user-alice', email: 'alice@example.test' },
  'bob-token': { id: 'user-bob', email: 'bob@example.test' },
});

/** A token verifier that knows two users. Anything else is "not signed in". */
export function fakeVerifier({ down = false } = {}) {
  const calls = [];
  const verify = async (token) => {
    calls.push(token);
    if (down) throw new Error('connection refused');
    return USERS[token] ?? null;
  };
  verify.calls = calls;
  return verify;
}

/**
 * A fake database that behaves like Row Level Security: the client built for one token can only
 * see that token's own rows, whatever the code asks for. That lets tests prove that a bug in
 * handler code still cannot leak another user's data.
 */
export function fakeDbFactory(tables = {}) {
  const inserts = [];
  const queries = [];
  let failWith = null;

  const createDb = (token) => {
    const actingAs = USERS[token]?.id ?? null;
    return {
      from(table) {
        const state = { table, filters: {} };
        const api = {
          select() {
            return api;
          },
          eq(column, value) {
            state.filters[column] = value;
            return api;
          },
          async maybeSingle() {
            queries.push({ actingAs, ...state });
            if (failWith) return { data: null, error: failWith };
            const rows = (tables[table] ?? []).filter((r) => r.owner === actingAs);
            const match = rows.find((r) =>
              Object.entries(state.filters).every(([c, v]) => r[c] === v),
            );
            return { data: match ?? null, error: null };
          },
          async insert(row) {
            inserts.push({ actingAs, table, row });
            return { data: null, error: failWith };
          },
        };
        return api;
      },
    };
  };

  return {
    createDb,
    inserts,
    queries,
    failNextWith(error) {
      failWith = error;
    },
  };
}
