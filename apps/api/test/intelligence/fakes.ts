import type { FetchLike, HttpResponseLike } from '../../src/modules/intelligence/providerHttp.ts';

export const reply = (status: number, body: unknown, raw = false): HttpResponseLike => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (raw ? String(body) : JSON.stringify(body)),
});

export interface FakeFetch {
  fetchImpl: FetchLike;
  calls: string[];
}

/** `script` is called for every request in order; it may return a response or throw. */
export function fakeFetch(
  script: (
    url: string,
    n: number,
    signal: AbortSignal,
  ) => Promise<HttpResponseLike> | HttpResponseLike,
): FakeFetch {
  const calls: string[] = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push(url);
      return script(url, calls.length, init.signal);
    },
  };
}

export const noSleep = async (): Promise<void> => {};

export const silentLogger = { warn: () => {}, logged: [] as unknown[][] };

export function recordingLogger() {
  const logged: unknown[][] = [];
  return { logged, warn: (...a: unknown[]) => void logged.push(a) };
}

export function gdeltPayload(titles: Array<[string, string]>) {
  return {
    articles: titles.map(([title, url], i) => ({
      url,
      title,
      seendate: `20261127T10${String(10 + i).padStart(2, '0')}00Z`,
      domain: new URL(url).hostname,
    })),
  };
}
