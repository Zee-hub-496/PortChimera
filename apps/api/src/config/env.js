import { z } from 'zod';

// All configuration is read and validated in this one place. If something is missing or
// malformed the server refuses to start, which is better than failing mysteriously later.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGIN: z.string().url().default('http://localhost:5173'),
  // Number of reverse proxies in front of the API (0 = none, for local dev). Express uses it to
  // find the real client IP in X-Forwarded-For, which is the rate-limit key.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),

  // Optional for now; the foundation spec (task 3) makes them required once auth is wired in.
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).optional(),
});

/**
 * @param {Record<string, string | undefined>} source usually process.env; tests pass their own.
 */
export function loadEnv(source = process.env) {
  const result = schema.safeParse(source);
  if (!result.success) {
    // Print variable names only, never their values, so secrets cannot leak into logs.
    const problems = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n  ${problems.join('\n  ')}`);
  }
  // In production these have no safe default: a missing CORS_ORIGIN would fall back to
  // localhost, and missing Supabase settings would leave the API unable to check sign-ins.
  // SUPABASE_SERVICE_ROLE_KEY is optional: without it status is written as the signed-in user
  // (fine until migration 0004 is applied; server.js warns at startup).
  if (result.data.NODE_ENV === 'production') {
    const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'CORS_ORIGIN'].filter(
      (name) => !source[name],
    );
    if (missing.length > 0) {
      throw new Error(
        `Invalid environment configuration:\n  required in production: ${missing.join(', ')}`,
      );
    }
  }

  return Object.freeze(result.data);
}
