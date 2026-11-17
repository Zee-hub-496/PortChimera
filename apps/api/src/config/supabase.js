import { createClient } from '@supabase/supabase-js';

// The server holds no login session of its own. Each request is checked and handled on its own.
const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

/**
 * A client with only the public (anon) key. It is used for one job: asking Supabase whether a
 * token is valid. It carries no user and can read nothing that Row Level Security protects.
 */
export function createAnonClient(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: NO_SESSION });
}

/**
 * A client that acts AS the signed-in user: it sends their token with every query, so Postgres
 * applies Row Level Security for them. All user data access goes through this.
 *
 * There is deliberately no helper for the service-role key here. That key skips Row Level Security
 * and is only needed for signing storage URLs; it will be added with the upload feature, in its own
 * clearly named function, so it cannot be used for user data by accident.
 */
export function createUserClient(env, token) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: NO_SESSION,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
