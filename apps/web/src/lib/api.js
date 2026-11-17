// Single place that talks to the backend. Components call these functions and never use
// fetch directly, so auth headers and error handling can be added once, here.
const BASE_URL = import.meta.env.VITE_API_URL ?? '';

export async function apiGet(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error?.message ?? `Request failed with status ${res.status}`);
  }
  return body.data;
}
