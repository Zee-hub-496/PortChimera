// Entry point for the 2.0 TypeScript modules. Import it as "@portchimera/core/v2".
// It is separate from index.js on purpose: the existing API and web app keep loading only
// JavaScript, so running .ts files is needed only by the new code (Node 22.18 or later).

export { distanceKm, greatCirclePoints, densify, wrapLon, distanceToPathKm } from './geo/geo.ts';
export type { LonLat } from './geo/geo.ts';
export { CHOKEPOINTS, getChokepoint, chokepointIdsOnPath } from './geo/chokepoints.ts';
export type { Chokepoint } from './geo/chokepoints.ts';

export * from './intelligence/types.ts';
export {
  REGIONS,
  regionById,
  regionContains,
  findRegions,
  mentions,
} from './intelligence/gazetteer.ts';
export type { Region } from './intelligence/gazetteer.ts';
export { dedupe, hostnameOf, normalizeTitle, normalizeUrl, stableId } from './intelligence/url.ts';
export {
  OFFICIAL_DOMAINS,
  classifyCategory,
  classifySource,
  hasClosureLanguage,
  matchGeography,
  matchPorts,
  scoreRelevance,
} from './intelligence/classify.ts';
export type { EventOrigin, GeoMatch } from './intelligence/classify.ts';

export {
  ENERGY_STALE_AFTER_DAYS,
  cleanRecords,
  isEnergyDataStale,
  summarizeSeries,
} from './energy/series.ts';
export type { EnergySummary, Trend } from './energy/series.ts';

export { EXPOSURE_DISCLAIMER, EXPOSURE_STATES, assessExposure } from './exposure/assess.ts';
export type {
  ExposureAssessment,
  ExposureItem,
  ExposureState,
  RouteInput,
  RouteSegment,
  SuggestedEffect,
} from './exposure/assess.ts';

export {
  GDELT_MAX_RECORDS,
  GDELT_TOPIC_QUERIES,
  buildGdeltUrl,
  cleanText,
  parseGdeltArticles,
  parseSeenDate,
} from './intelligence/gdelt.ts';
export type { ParsedEvents } from './intelligence/gdelt.ts';
export { EIA_SERIES, buildEiaUrl, parseEiaRows } from './energy/eia.ts';
export type {
  EnergyPayload,
  NewsMeta,
  NewsPageResponse,
  OfficialLink,
} from './intelligence/contracts.ts';
