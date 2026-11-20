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
  const updates = [];
  const deletes = [];
  const queries = [];
  let failWith = null;
  let storageFailWith = null;
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
            processing_status: table === 'documents' ? 'uploaded' : undefined,
            ...row,
            user_id: row.user_id ?? actingAs,
            owner: actingAs,
          };
          if (stored.status === undefined) delete stored.status;
          if (stored.processing_status === undefined) delete stored.processing_status;
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
          insert(input) {
            let result;
            if (Array.isArray(input)) {
              const done = input.map(doInsert);
              result = done.find((r) => r.error) ?? { data: done.map((r) => r.data), error: null };
            } else {
              result = doInsert(input);
            }
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
        // update(values) / delete() only touch rows this user can see, and only those that match
        // the .eq()/.in() filters, like Row Level Security plus a WHERE clause.
        const mutation = (apply) => {
          const filters = {};
          const lists = {};
          let selecting = false;
          const exec = () => {
            const saved = { f: state.filters, l: state.inList };
            state.filters = filters;
            state.inList = lists;
            queries.push({ actingAs, ...state });
            const rows = failWith ? [] : matching();
            state.filters = saved.f;
            state.inList = saved.l;
            if (failWith) return { data: null, error: failWith };
            apply(rows);
            return { data: selecting ? rows : null, error: null };
          };
          const chain = {
            eq(column, value) {
              filters[column] = value;
              return chain;
            },
            in(column, values) {
              lists[column] = values;
              return chain;
            },
            select() {
              selecting = true;
              return chain;
            },
            async maybeSingle() {
              const res = exec();
              return res.error ? res : { data: res.data[0] ?? null, error: null };
            },
            then(resolve, reject) {
              return Promise.resolve(exec()).then(resolve, reject);
            },
          };
          return chain;
        };
        api.update = (values) => {
          updates.push({ actingAs, table, values });
          return mutation((rows) => rows.forEach((r) => Object.assign(r, values)));
        };
        api.delete = () => {
          deletes.push({ actingAs, table });
          return mutation((rows) => {
            const list = tables[table] ?? [];
            for (const r of rows) list.splice(list.indexOf(r), 1);
          });
        };
        return api;
      },
      storage: {
        from(bucket) {
          return fakeBucket(bucket, actingAs);
        },
      },
    };
  };

  // A private bucket that only lets a user touch objects under their own user-id folder,
  // like the storage policies in the migration. Objects are kept in `objects` (path -> Blob).
  const objects = new Map();
  const storageCalls = [];
  const denied = { data: null, error: { message: 'new row violates row-level security policy' } };
  const fakeBucket = (bucket, actingAs) => {
    const allowed = (path) => actingAs !== null && String(path).split('/')[0] === actingAs;
    return {
      async upload(path, body, options = {}) {
        storageCalls.push({ op: 'upload', bucket, path, options, actingAs });
        if (!allowed(path)) return denied;
        if (storageFailWith) return { data: null, error: storageFailWith };
        if (objects.has(path))
          return { data: null, error: { message: 'The resource already exists' } };
        objects.set(path, new Blob([body]));
        return { data: { path }, error: null };
      },
      async download(path) {
        storageCalls.push({ op: 'download', bucket, path, actingAs });
        if (!allowed(path) || !objects.has(path)) {
          return { data: null, error: { message: 'Object not found' } };
        }
        return { data: objects.get(path), error: null };
      },
      async remove(paths) {
        storageCalls.push({ op: 'remove', bucket, paths, actingAs });
        const mine = paths.filter(allowed);
        for (const p of mine) objects.delete(p);
        return { data: mine.map((name) => ({ name })), error: null };
      },
      async createSignedUrl(path, seconds) {
        storageCalls.push({ op: 'sign', bucket, path, seconds, actingAs });
        if (!allowed(path) || !objects.has(path)) {
          return { data: null, error: { message: 'Object not found' } };
        }
        return {
          data: { signedUrl: `https://storage.example.test/sign/${bucket}/${path}?token=t` },
          error: null,
        };
      },
    };
  };

  return {
    createDb,
    updates,
    deletes,
    objects,
    storageCalls,
    failStorageWith(error) {
      storageFailWith = error;
    },
    inserts,
    queries,
    failNextWith(error) {
      failWith = error;
    },
  };
}
