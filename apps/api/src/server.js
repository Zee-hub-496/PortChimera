import { loadEnv } from './config/env.js';
import { createApp } from './app.js';
import { createAnonClient, createUserClient } from './config/supabase.js';
import { makeSupabaseVerifier } from './middleware/supabaseVerifier.js';

const env = loadEnv();

let auth = null;
if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
  auth = {
    verifyToken: makeSupabaseVerifier(createAnonClient(env)),
    createDb: (token) => createUserClient(env, token),
  };
} else {
  console.warn(
    'Supabase is not configured (SUPABASE_URL and SUPABASE_ANON_KEY). Protected routes are disabled. See docs/SETUP_SUPABASE.md.',
  );
}

const app = createApp(env, { auth });

app.listen(env.PORT, () => {
  console.log(`PortChimera API listening on port ${env.PORT} (${env.NODE_ENV})`);
});
