// Response shapes of the /api/intelligence endpoints. The API builds them and the web app reads
// them, so both import these types from here. Types only: nothing here runs.

import type { EnergySummary } from '../energy/series.ts';
import type { DisruptionEvent, OilMarketRecord } from './types.ts';

export interface OfficialLink {
  readonly name: string;
  readonly url: string;
  readonly note: string;
}

export interface NewsMeta {
  /** When the server fetched the news from GDELT (ISO 8601). */
  readonly fetchedAt: string;
  readonly ageSeconds: number;
  readonly ttlSeconds: number;
  /** A refresh failed and older data is shown. */
  readonly stale: boolean;
  readonly lastError: string | null;
  /** A manual refresh came too soon and the cached data was returned. */
  readonly refreshThrottled: boolean;
  readonly queriesOk: number;
  readonly queriesFailed: number;
  readonly dropped: { readonly malformed: number; readonly irrelevant: number };
  readonly source: string;
  readonly officialLinks: readonly OfficialLink[];
}

export interface NewsPageResponse {
  readonly items: readonly DisruptionEvent[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
  readonly meta: NewsMeta;
}

export interface EnergyPayload {
  readonly state: 'OK' | 'NOT_CONFIGURED';
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
  /** The newest price itself is old, whatever the cache state. */
  readonly dataStale: boolean;
  readonly lastError: string | null;
  readonly note: string;
}
