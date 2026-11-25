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
 * The only exception is `createStatusWriterClient` below.
 */
export function createUserClient(env, token) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: NO_SESSION,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/**
 * A client with the service-role key. It SKIPS Row Level Security, so it is used for exactly one
 * thing: writing `shipments.status` (migration 0004 blocks that column for signed-in users).
 * `syncShipmentStatus` checks that the shipment is the caller's with the user's own client first.
 * Never use it to read or write anything else, never send the key to the browser, never log it.
 */
export function createStatusWriterClient(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: NO_SESSION });
}
