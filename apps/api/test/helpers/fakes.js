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
 *
 * Options:
 *  - shared: table names readable by every signed-in user (reference data such as ports).
 *  - rls: set to false to switch the row-level emulation off, so only filters written in code
 *    (such as .eq('user_id', ...)) separate users. Use it to test the code-level ownership check.
 *  - unique: { table: [columns] } makes a second insert with the same values (for the same
 *    owner) fail with Postgres error code 23505, like a unique constraint.
 *
 * Inserted rows get `owner` (and `user_id`, when the row has none) set to the acting user, and an
 * `id` and `created_at` when missing. Inserting a row whose user_id is someone else fails with
 * code 42501, like a failed RLS `with check`.
 */
export function fakeDbFactory(tables = {}, { shared = [], unique = {}, rls = true } = {}) {
  const inserts = [];
  const queries = [];
  let failWith = null;
  let counter = 0;

  const createDb = (token) => {
    const actingAs = USERS[token]?.id ?? null;
    return {
      from(table) {
        const state = { table, filters: {}, inList: {}, orderBy: null };
        const visibleRows = () =>
          (tables[table] ?? []).filter(
            (r) => !rls || shared.includes(table) || r.owner === actingAs,
          );
        const matching = () => {
          let rows = visibleRows().filter((r) =>
            Object.entries(state.filters).every(([c, v]) => r[c] === v),
          );
          rows = rows.filter((r) =>
            Object.entries(state.inList).every(([c, list]) => list.includes(r[c])),
          );
          if (state.orderBy) {
            const { column, ascending } = state.orderBy;
            rows = [...rows].sort((a, b) => {
              const cmp = a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : 0;
              return ascending ? cmp : -cmp;
            });
          }
          return rows;
        };
        const run = () => {
          queries.push({ actingAs, ...state });
          if (failWith) return { data: null, error: failWith };
          return { data: matching(), error: null };
        };

        const doInsert = (row) => {
          inserts.push({ actingAs, table, row });
          if (failWith) return { data: null, error: failWith };
          if (row.user_id !== undefined && row.user_id !== actingAs) {
            return { data: null, error: { code: '42501', message: 'row violates policy' } };
          }
          const columns = unique[table];
          if (columns) {
            const clash = (tables[table] ?? []).some(
              (r) => r.owner === actingAs && columns.every((c) => r[c] === row[c]),
            );
            if (clash) return { data: null, error: { code: '23505', message: 'duplicate' } };
          }
          // Only tables the test declared are stored, so audit-only tests keep their old shape.
          if (!tables[table]) return { data: null, error: null };
          counter += 1;
          const stored = {
            id: `fake-id-${counter}`,
            created_at: new Date(Date.UTC(2025, 0, 1, 0, 0, counter)).toISOString(),
            status: table === 'shipments' ? 'submitted' : undefined,
            ...row,
            user_id: row.user_id ?? actingAs,
            owner: actingAs,
          };
          if (stored.status === undefined) delete stored.status;
          tables[table].push(stored);
          return { data: stored, error: null };
        };

        const api = {
          select() {
            return api;
          },
          eq(column, value) {
            state.filters[column] = value;
            return api;
          },
          in(column, values) {
            state.inList[column] = values;
            return api;
          },
          order(column, { ascending = true } = {}) {
            state.orderBy = { column, ascending };
            return api;
          },
          async maybeSingle() {
            const res = run();
            if (res.error) return res;
            return { data: res.data[0] ?? null, error: null };
          },
          then(resolve, reject) {
            return Promise.resolve(run()).then(resolve, reject);
          },
          insert(row) {
            const result = doInsert(row);
            const chain = {
              select() {
                return chain;
              },
              async single() {
                if (result.error) return result;
                return result.data
                  ? result
                  : { data: null, error: { code: 'PGRST116', message: 'no row' } };
              },
              then(resolve, reject) {
                return Promise.resolve({ data: null, error: result.error }).then(resolve, reject);
              },
            };
            return chain;
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
