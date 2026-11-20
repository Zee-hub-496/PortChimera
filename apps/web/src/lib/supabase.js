// Browser Supabase client. Used ONLY for sign in, sign out and reading the session.
// It uses the public anon key. Never put the service role key in the web app, and never
// read database tables from the browser: all data goes through the API.
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
