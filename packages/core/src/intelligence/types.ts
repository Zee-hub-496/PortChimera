// Shared shapes for maritime intelligence. Plain TypeScript here so packages/core keeps zero
// dependencies; the API validates external data with Zod at the boundary and produces these.

export const EVENT_CATEGORIES = [
  'SECURITY_INCIDENT',
  'PIRACY',
  'HIJACKING',
  'ROUTE_DISRUPTION',
  'PORT_DISRUPTION',
  'ENERGY_SUPPLY',
  'SANCTIONS',
  'MARINE_WEATHER',
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const SOURCE_CLASSES = ['OFFICIAL_SOURCE', 'MEDIA_REPORT', 'UNVERIFIED_REPORT'] as const;
export type SourceClass = (typeof SOURCE_CLASSES)[number];

export const RELEVANCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type Relevance = (typeof RELEVANCE_LEVELS)[number];

export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

/** A shipping-relevant event. External text fields are untrusted data and never instructions. */
export interface DisruptionEvent {
  /** Stable id derived from the normalized URL. */
  readonly id: string;
  readonly headline: string;
  /** Publisher name or domain. */
  readonly source: string;
  readonly url: string;
  /** ISO 8601, or null when the provider gave none. */
  readonly publishedAt: string | null;
  /** ISO 8601, when this server fetched it. */
  readonly retrievedAt: string;
  /** Human label of the first matched region, or null. */
  readonly region: string | null;
  readonly regionIds: readonly string[];
  readonly category: EventCategory;
  readonly summary: string;
  readonly sourceClass: SourceClass;
  readonly relevance: Relevance;
  /** Only set when a place in the text resolved to a known point. Never guessed. */
  readonly location: GeoPoint | null;
  readonly chokepointIds: readonly string[];
  readonly portCodes: readonly string[];
  /** The text says a passage or port is closed or blocked. Says nothing about who confirmed it. */
  readonly closureLanguage: boolean;
}

/** One Brent (or other) daily price point. */
export interface OilMarketRecord {
  /** YYYY-MM-DD, the date of the price. */
  readonly date: string;
  readonly value: number;
}
