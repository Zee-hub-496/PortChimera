// Pure helpers for the API client. No React, no import.meta, no fetch, so node:test can run them.

/** Builds request headers. Adds the Bearer token only when there is one. */
export function buildHeaders(accessToken, hasBody = false) {
  const headers = { Accept: 'application/json' };
  if (hasBody) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

/** Error thrown for any non-2xx response. `status` and `code` come from the API envelope. */
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Turns a response (status + parsed JSON body or null) into data or an ApiError.
 * The API answers { data } on success and { error: { code, message } } on failure.
 */
export function parseEnvelope(status, body) {
  const ok = status >= 200 && status < 300;
  if (ok) return body?.data;
  throw new ApiError(
    status,
    body?.error?.code ?? 'REQUEST_FAILED',
    body?.error?.message ?? `Request failed with status ${status}`,
  );
}
