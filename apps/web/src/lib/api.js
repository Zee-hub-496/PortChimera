// Single place that talks to the backend. Components call these functions and never use
// fetch directly, so auth headers and error handling live here.
import { buildHeaders, parseEnvelope } from './apiCore.js';
import { supabase } from './supabase.js';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

async function request(method, path, body) {
  const { data } = await supabase.auth.getSession();
  const hasBody = body !== undefined;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: buildHeaders(data.session?.access_token, hasBody),
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (res.status === 401) {
    // The token is missing or expired. Signing out sends the user back to the login page.
    await supabase.auth.signOut();
  }
  return parseEnvelope(res.status, json);
}

export function apiGet(path) {
  return request('GET', path);
}

export function apiPost(path, body) {
  return request('POST', path, body);
}
