import {
  buildEiaUrl,
  cleanRecords,
  EIA_SERIES,
  isEnergyDataStale,
  parseEiaRows,
  summarizeSeries,
} from '@portchimera/core/v2';
import type { EnergySummary, OilMarketRecord } from '@portchimera/core/v2';
import { ProviderError, defaultSleep, fetchJson } from './providerHttp.ts';
import type { FetchLike } from './providerHttp.ts';

/** EIA daily data changes once per business day. */
export const ENERGY_TTL_MS = 6 * 60 * 60 * 1000;
const HISTORY_POINTS = 90;

export type EnergyState = 'OK' | 'NOT_CONFIGURED';

export interface EnergyResult {
  readonly state: EnergyState;
  readonly series: 'RBRTE';
  readonly label: string;
  readonly unit: string;
  readonly summary: EnergySummary | null;
  /** Oldest first, for charts. */
  readonly history: readonly OilMarketRecord[];
  /** When this server last fetched from EIA. Null when never. */
  readonly fetchedAt: string | null;
  /** The last refresh failed and older data is shown. */
  readonly stale: boolean;
  /** The newest price itself is old (market data date), whatever the cache state. */
  readonly dataStale: boolean;
  readonly lastError: string | null;
  readonly note: string;
}

export const ENERGY_NOTE =
  'Brent is a crude oil price benchmark. It is not a freight rate, a marine insurance premium or a ship fuel price, and it does not change route risk in PortChimera.';

export interface EnergyServiceDeps {
  apiKey: string | undefined;
  fetchImpl: FetchLike;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  ttlMs?: number;
  timeoutMs?: number;
  retries?: number;
  logger?: { warn(...a: unknown[]): void };
}

export interface EnergyService {
  getEnergy(): Promise<EnergyResult>;
}

const BASE = {
  series: 'RBRTE',
  label: 'Europe Brent spot price FOB',
  unit: 'USD per barrel',
  note: ENERGY_NOTE,
} as const;

export function createEnergyService(deps: EnergyServiceDeps): EnergyService {
  const now = deps.now ?? Date.now;
  const ttl = deps.ttlMs ?? ENERGY_TTL_MS;
  const logger = deps.logger ?? console;
  const http = {
    fetchImpl: deps.fetchImpl,
    timeoutMs: deps.timeoutMs ?? 8000,
    retries: deps.retries ?? 1,
    backoffMs: 500,
    maxBytes: 1_000_000,
    sleep: deps.sleep ?? defaultSleep,
  };
  let cache: { result: EnergyResult; at: number } | null = null;
  let inFlight: Promise<EnergyResult> | null = null;
  let failure: { at: number; code: string } | null = null;

  async function refresh(key: string): Promise<EnergyResult> {
    // The key goes only into this URL. It is never logged and never part of an error message.
    const url = `${buildEiaUrl(EIA_SERIES.BRENT, 120)}&api_key=${encodeURIComponent(key)}`;
    const payload = await fetchJson(url, http);
    const rows = parseEiaRows(payload);
    if (rows === null) throw new ProviderError('BAD_PAYLOAD', 'Unexpected response shape');
    const at = now();
    const summary = summarizeSeries(rows, new Date(at));
    if (summary === null) throw new ProviderError('BAD_PAYLOAD', 'No valid price in the response');
    const history = cleanRecords(rows).records.slice(0, HISTORY_POINTS).reverse();
    return {
      ...BASE,
      state: 'OK',
      summary,
      history,
      fetchedAt: new Date(at).toISOString(),
      stale: false,
      dataStale: isEnergyDataStale(summary),
      lastError: null,
    };
  }

  return {
    async getEnergy() {
      if (deps.apiKey === undefined || deps.apiKey === '') {
        return {
          ...BASE,
          state: 'NOT_CONFIGURED',
          summary: null,
          history: [],
          fetchedAt: null,
          stale: false,
          dataStale: false,
          lastError: null,
        };
      }
      const key = deps.apiKey;
      if (cache !== null && now() - cache.at < ttl) return cache.result;
      const fallback = (code: string, err?: unknown): EnergyResult => {
        if (cache !== null) return { ...cache.result, stale: true, lastError: code };
        throw err instanceof ProviderError
          ? err
          : new ProviderError('NETWORK', 'Energy data is not available right now');
      };
      if (failure !== null && now() - failure.at < 60_000) return fallback(failure.code);
      inFlight ??= refresh(key).finally(() => {
        inFlight = null;
      });
      try {
        const result = await inFlight;
        failure = null;
        cache = { result, at: now() };
        return result;
      } catch (err) {
        const code = err instanceof ProviderError ? err.code : 'UNAVAILABLE';
        failure = { at: now(), code };
        logger.warn('energy_refresh_failed', { code });
        return fallback(code, err);
      }
    },
  };
}
