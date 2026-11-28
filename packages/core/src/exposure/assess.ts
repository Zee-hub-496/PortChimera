import { CHOKEPOINTS, chokepointIdsOnPath, getChokepoint } from '../geo/chokepoints.ts';
import { densify, distanceToPathKm } from '../geo/geo.ts';
import type { LonLat } from '../geo/geo.ts';
import { REGIONS, regionById, regionContains } from '../intelligence/gazetteer.ts';
import type { DisruptionEvent } from '../intelligence/types.ts';

export const EXPOSURE_STATES = [
  'NO_KNOWN_EXPOSURE',
  'REGIONAL_MATCH',
  'ROUTE_EXPOSURE',
  'CONFIRMED_ROUTE_CLOSURE',
] as const;
export type ExposureState = (typeof EXPOSURE_STATES)[number];

const RANK: Record<ExposureState, number> = {
  NO_KNOWN_EXPOSURE: 0,
  REGIONAL_MATCH: 1,
  ROUTE_EXPOSURE: 2,
  CONFIRMED_ROUTE_CLOSURE: 3,
};

/** One lane of the planned route with its drawn geometry ([lon, lat] points, ports included). */
export interface RouteSegment {
  readonly from: string;
  readonly to: string;
  readonly path: readonly LonLat[];
}

export interface RouteInput {
  /** Port codes in order. */
  readonly portCodes: readonly string[];
  readonly segments: readonly RouteSegment[];
}

/** Matches the effect shape accepted by simulateDisruption in the routing module. */
export type SuggestedEffect =
  | { readonly type: 'port_strike'; readonly portCode: string }
  | { readonly type: 'connection_failure'; readonly from: string; readonly to: string };

export interface ExposureItem {
  readonly eventId: string;
  readonly headline: string;
  readonly url: string;
  readonly source: string;
  readonly sourceClass: DisruptionEvent['sourceClass'];
  readonly publishedAt: string | null;
  readonly state: ExposureState;
  /** Which part of the route the event touches, in plain words. */
  readonly geographicConnection: string;
  readonly why: string;
  readonly verified: readonly string[];
  readonly uncertain: readonly string[];
  /** Inputs for the crisis simulator. The user must press simulate; nothing is applied. */
  readonly suggestedEffects: readonly SuggestedEffect[];
}

export interface ExposureAssessment {
  readonly state: ExposureState;
  readonly items: readonly ExposureItem[];
  readonly routeChokepointIds: readonly string[];
  readonly routeRegionIds: readonly string[];
  readonly disclaimer: string;
}

export const EXPOSURE_DISCLAIMER =
  'Exposure is a geographic comparison of reported events with the planned route. It is not a ' +
  'prediction, and it never changes a shipment. Run the crisis simulator to model an event.';

/** A weather event only counts for the route if it is placed within this distance of it. */
const WEATHER_NEAR_KM = 300;

const nameOf = (portCodes: readonly string[]): string => portCodes.join(', ');

/**
 * Compares events with a planned route. Pure and deterministic: same inputs, same output.
 *
 * Rules:
 *  - CONFIRMED_ROUTE_CLOSURE needs all of: an OFFICIAL_SOURCE event, closure wording, and a hit
 *    on a chokepoint or port that the route really uses.
 *  - Any other hit on a route chokepoint or port is ROUTE_EXPOSURE (a security incident is never
 *    treated as a closed lane; a media report of a closure stays ROUTE_EXPOSURE).
 *  - An event in a region the route crosses, with no direct hit, is REGIONAL_MATCH.
 *  - Marine weather needs a placed location near the route, otherwise it is at most REGIONAL_MATCH.
 *  - Sanctions and energy-supply events never exceed REGIONAL_MATCH: they say nothing about a lane.
 *  - Suggested simulator inputs exist only for official closures and port disruptions on the route.
 */
export function assessExposure(
  route: RouteInput,
  events: readonly DisruptionEvent[],
): ExposureAssessment {
  const fullPath: LonLat[] = route.segments.flatMap((s) => s.path);
  const routeChokepointIds = chokepointIdsOnPath(fullPath);
  const dense = densify(fullPath, 25);

  const routeRegionIds = REGIONS.filter((r) => {
    if (routeChokepointIds.some((id) => r.chokepointIds.includes(id))) return true;
    return dense.some((p) => regionContains(r, p[0], p[1]));
  }).map((r) => r.id);

  const onRoutePorts = new Set(route.portCodes);
  const items: ExposureItem[] = [];

  for (const event of events) {
    const chokeHits = event.chokepointIds.filter((id) => routeChokepointIds.includes(id));
    const portHits = event.portCodes.filter((code) => onRoutePorts.has(code));
    const regionHits = event.regionIds.filter((id) => routeRegionIds.includes(id));
    const official = event.sourceClass === 'OFFICIAL_SOURCE';
    const noLaneEvidence = event.category === 'SANCTIONS' || event.category === 'ENERGY_SUPPLY';

    let direct = chokeHits.length > 0 || portHits.length > 0;
    if (event.category === 'MARINE_WEATHER' && direct) {
      const near =
        event.location !== null &&
        distanceToPathKm([event.location.lon, event.location.lat], dense) <= WEATHER_NEAR_KM;
      if (!near) direct = false;
    }
    if (noLaneEvidence) direct = false;

    let state: ExposureState;
    if (direct && official && event.closureLanguage) state = 'CONFIRMED_ROUTE_CLOSURE';
    else if (direct) state = 'ROUTE_EXPOSURE';
    else if (regionHits.length > 0) state = 'REGIONAL_MATCH';
    else continue;

    const chokeNames = chokeHits.map((id) => getChokepoint(id)?.name ?? id);
    const regionNames = regionHits.map((id) => regionById(id)?.name ?? id);
    const parts: string[] = [];
    if (chokeNames.length > 0) parts.push(`the route passes ${chokeNames.join(' and ')}`);
    if (portHits.length > 0) parts.push(`the route calls at ${nameOf(portHits)}`);
    if (state === 'REGIONAL_MATCH')
      parts.push(
        `the route crosses ${regionNames.join(' and ')} but no named passage or port of the event is on it`,
      );

    const verified: string[] = [
      `The report exists at ${event.source} (${event.sourceClass.replace('_', ' ').toLowerCase()}).`,
    ];
    if (event.publishedAt !== null) verified.push(`It was published ${event.publishedAt}.`);
    if (chokeHits.length > 0 || portHits.length > 0)
      verified.push('The named place is on the planned route (deterministic geometry check).');

    const uncertain: string[] = ['Whether vessels on this route are actually delayed or at risk.'];
    if (!official) uncertain.push('The report is not from an official maritime authority.');
    if (event.closureLanguage && !(official && direct))
      uncertain.push(
        'Any closure is not officially confirmed here, so no lane is treated as closed.',
      );
    if (
      event.category === 'SECURITY_INCIDENT' ||
      event.category === 'PIRACY' ||
      event.category === 'HIJACKING'
    )
      uncertain.push('A security incident does not mean the passage is closed.');
    if (state === 'REGIONAL_MATCH')
      uncertain.push(
        'A region match is broader than a route match; it may not affect this shipment.',
      );
    if (noLaneEvidence)
      uncertain.push('This event type describes markets or policy, not a closed lane.');
    if (event.category === 'MARINE_WEATHER' && !direct)
      uncertain.push('The weather event has no location close to the route.');

    const suggestedEffects: SuggestedEffect[] = [];
    if (state === 'CONFIRMED_ROUTE_CLOSURE') {
      for (const seg of route.segments) {
        const segChoke = chokepointIdsOnPath(seg.path);
        if (segChoke.some((id) => chokeHits.includes(id))) {
          suggestedEffects.push({ type: 'connection_failure', from: seg.from, to: seg.to });
          suggestedEffects.push({ type: 'connection_failure', from: seg.to, to: seg.from });
        }
      }
    }
    if (event.category === 'PORT_DISRUPTION') {
      for (const code of portHits) suggestedEffects.push({ type: 'port_strike', portCode: code });
    }

    items.push({
      eventId: event.id,
      headline: event.headline,
      url: event.url,
      source: event.source,
      sourceClass: event.sourceClass,
      publishedAt: event.publishedAt,
      state,
      geographicConnection:
        parts.length > 0 ? `${parts.join('; ')}.` : 'No direct geographic connection.',
      why:
        state === 'CONFIRMED_ROUTE_CLOSURE'
          ? 'An official source reports a closure at a place this route uses.'
          : state === 'ROUTE_EXPOSURE'
            ? 'A reported event is at a place this route uses. Its effect on the route is not established.'
            : 'The event is in a sea region the route crosses.',
      verified,
      uncertain,
      suggestedEffects,
    });
  }

  items.sort((a, b) => RANK[b.state] - RANK[a.state]);
  const top = items[0];
  return {
    state: top === undefined ? 'NO_KNOWN_EXPOSURE' : top.state,
    items,
    routeChokepointIds,
    routeRegionIds,
    disclaimer: EXPOSURE_DISCLAIMER,
  };
}

/** Number of chokepoints the module knows about; exported for tests and documentation. */
export const KNOWN_CHOKEPOINT_COUNT = CHOKEPOINTS.length;
