/**
 * Turns a Supabase client into the `verifyToken` function that requireAuth needs.
 *
 * Why ask Supabase instead of checking the token ourselves: Supabase stays the single authority
 * (it knows about revoked sessions and key rotation) and this server never holds the token-signing
 * secret. The cost is one network call per request, which is fine at this scale.
 *
 * The important distinction:
 *   - Supabase says "this token is not valid"  -> return null   (the caller is not signed in)
 *   - Supabase cannot be reached or is failing -> throw         (not the caller's fault)
 *
 * NOTE: the status-code rules below follow how supabase-js reports errors as of writing. They are
 * covered by tests with a fake client, but have not yet been checked against the real service.
 *
 * @param {{auth: {getUser: (token: string) => Promise<{data: any, error: any}>}}} client
 */
export function makeSupabaseVerifier(client) {
  return async function verifyToken(token) {
    const { data, error } = await client.auth.getUser(token);

    if (error) {
      const status = error.status;
      const serviceProblem =
        status === 0 || status === undefined
          ? error.name === 'AuthRetryableFetchError'
          : status >= 500;
      if (serviceProblem) throw error;
      return null; // 400, 401, 403 and similar: the token was rejected
    }

    const user = data?.user;
    return user?.id ? { id: user.id, email: user.email ?? null } : null;
  };
}
