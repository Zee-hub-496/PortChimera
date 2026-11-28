// One small HTTP helper for external data providers: timeout through AbortController, bounded
// retries for transient failures, a size cap, and errors that never contain the request URL
// (the URL may carry an API key).

export type ProviderErrorCode = 'TIMEOUT' | 'NETWORK' | 'HTTP_ERROR' | 'BAD_PAYLOAD';

export class ProviderError extends Error {
  code: ProviderErrorCode;
  status: number | null;
  constructor(code: ProviderErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.status = status;
  }
}

export interface HttpResponseLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}
export type FetchLike = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<HttpResponseLike>;

export interface FetchJsonOptions {
  fetchImpl: FetchLike;
  timeoutMs: number;
  /** Extra attempts after the first one. */
  retries: number;
  backoffMs: number;
  maxBytes: number;
  sleep: (ms: number) => Promise<void>;
}

export const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const isTransient = (e: ProviderError): boolean =>
  e.code === 'TIMEOUT' ||
  e.code === 'NETWORK' ||
  (e.code === 'HTTP_ERROR' && (e.status === 429 || (e.status ?? 0) >= 500));

async function attempt(url: string, o: FetchJsonOptions): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), o.timeoutMs);
  try {
    let res: HttpResponseLike;
    try {
      res = await o.fetchImpl(url, {
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'user-agent': 'PortChimera/2.0 (maritime intelligence; contact via GitHub)',
        },
      });
    } catch (err) {
      if (controller.signal.aborted || (err as { name?: string } | null)?.name === 'AbortError') {
        throw new ProviderError('TIMEOUT', 'The data provider did not answer in time');
      }
      throw new ProviderError('NETWORK', 'The data provider could not be reached');
    }
    if (!res.ok)
      throw new ProviderError(
        'HTTP_ERROR',
        `The data provider answered with status ${res.status}`,
        res.status,
      );
    let body: string;
    try {
      body = await res.text();
    } catch {
      if (controller.signal.aborted)
        throw new ProviderError('TIMEOUT', 'The data provider did not answer in time');
      throw new ProviderError('NETWORK', 'The data provider connection failed');
    }
    if (body.length > o.maxBytes)
      throw new ProviderError('BAD_PAYLOAD', 'The data provider response was too large');
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new ProviderError('BAD_PAYLOAD', 'The data provider did not return JSON');
    }
  } finally {
    clearTimeout(timer);
  }
}

/** GET a URL and parse JSON. Retries transient failures, throws ProviderError otherwise. */
export async function fetchJson(url: string, o: FetchJsonOptions): Promise<unknown> {
  let last: ProviderError | null = null;
  for (let i = 0; i <= o.retries; i++) {
    if (i > 0) await o.sleep(o.backoffMs * i);
    try {
      return await attempt(url, o);
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;
      last = err;
      if (!isTransient(err)) break;
    }
  }
  throw last ?? new ProviderError('NETWORK', 'The data provider could not be reached');
}
