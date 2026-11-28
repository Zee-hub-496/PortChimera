// Single place that talks to the backend. Components call these functions and never use
// fetch directly, so auth headers and error handling live here.
import { buildHeaders, buildUploadHeaders, healthUrl, parseEnvelope } from './apiCore.js';
import { supabase } from './supabase.js';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

/**
 * Wakes a sleeping API. A free host stops the server after a while without traffic and the first
 * request then takes about a minute. Calling this when the page opens starts that wake-up while
 * the visitor is still reading the landing page or typing their password. The answer is ignored.
 */
export function warmUpApi() {
  try {
    fetch(healthUrl(BASE_URL), { cache: 'no-store' }).catch(() => {});
  } catch {
    // Nothing to do: this is only a courtesy request.
  }
}

async function request(method, path, body) {
  const { data } = await supabase.auth.getSession();
  const hasBody = body !== undefined;
  return send(path, {
    method,
    headers: buildHeaders(data.session?.access_token, hasBody),
    body: hasBody ? JSON.stringify(body) : undefined,
  });
}

async function send(path, init) {
  const res = await fetch(`${BASE_URL}${path}`, init);
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

export function apiPut(path, body) {
  return request('PUT', path, body);
}

export function apiPatch(path, body) {
  return request('PATCH', path, body);
}

export function apiDelete(path) {
  return request('DELETE', path);
}

/** Uploads a File as the raw request body (no JSON, no multipart). */
export async function apiUploadFile(path, file) {
  const { data } = await supabase.auth.getSession();
  return send(path, {
    method: 'POST',
    headers: buildUploadHeaders(data.session?.access_token, file.type, file.name),
    body: file,
  });
}
