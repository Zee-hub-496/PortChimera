import { CHOKEPOINTS, getChokepoint } from '../geo/chokepoints.ts';
import { findRegions, mentions } from './gazetteer.ts';
import { hostnameOf } from './url.ts';
import type { EventCategory, GeoPoint, Relevance, SourceClass } from './types.ts';

// Checked in this order; the first category with a match wins. More specific categories come
// first so "tanker hijacked near Hormuz" is HIJACKING, not SECURITY_INCIDENT.
const CATEGORY_RULES: ReadonlyArray<readonly [EventCategory, readonly string[]]> = [
  [
    'HIJACKING',
    [
      'hijack',
      'hijacked',
      'hijacking',
      'seized vessel',
      'vessel seized',
      'ship seized',
      'tanker seized',
      'boarded and seized',
    ],
  ],
  ['PIRACY', ['piracy', 'pirate', 'pirates', 'armed robbery', 'skiff approached']],
  [
    'SANCTIONS',
    ['sanction', 'sanctions', 'embargo', 'price cap', 'blacklisted vessels', 'export ban'],
  ],
  [
    'PORT_DISRUPTION',
    [
      'port strike',
      'dockworker',
      'dockworkers',
      'longshoremen',
      'port congestion',
      'port closed',
      'port closure',
      'terminal closed',
      'berth congestion',
      'customs strike',
      'terminal strike',
    ],
  ],
  [
    'ROUTE_DISRUPTION',
    [
      'canal blocked',
      'canal closure',
      'canal closed',
      'strait closed',
      'strait closure',
      'blockage',
      'rerouting',
      'rerouted',
      'diverting',
      'diverted',
      'suez',
      'run aground',
      'ran aground',
      'grounded',
    ],
  ],
  [
    'SECURITY_INCIDENT',
    [
      'missile',
      'drone attack',
      'drone strike',
      'explosion',
      'attacked',
      'attack on',
      'limpet',
      'naval mine',
      'ukmto',
      'warship',
      'houthi',
      'projectile',
      'ship struck',
    ],
  ],
  [
    'ENERGY_SUPPLY',
    [
      'oil export',
      'crude export',
      'export terminal',
      'refinery',
      'pipeline',
      'lng',
      'oil supply',
      'tanker rates',
      'opec',
    ],
  ],
  [
    'MARINE_WEATHER',
    [
      'typhoon',
      'cyclone',
      'hurricane',
      'tropical storm',
      'gale warning',
      'storm warning',
      'heavy weather',
    ],
  ],
];

const MARITIME_CONTEXT = [
  'ship',
  'vessel',
  'tanker',
  'maritime',
  'shipping',
  'port',
  'strait',
  'canal',
  'cargo',
  'container',
  'sea',
  'naval',
  'crude',
  'terminal',
  'bulk carrier',
];

const CLOSURE_PHRASES = ['closed', 'closure', 'blocked', 'blockage', 'shut', 'suspended', 'halted'];

/** First matching category, or null when the text is not about shipping disruption. */
export function classifyCategory(text: string): EventCategory | null {
  for (const [category, phrases] of CATEGORY_RULES) {
    if (phrases.some((p) => mentions(text, p))) {
      // Generic security words need some maritime context to avoid land-war headlines.
      if (category === 'SECURITY_INCIDENT' && !MARITIME_CONTEXT.some((w) => mentions(text, w)))
        continue;
      return category;
    }
  }
  return null;
}

/** True when the text uses closure wording. This is a language check, not a confirmation. */
export function hasClosureLanguage(text: string): boolean {
  return CLOSURE_PHRASES.some((p) => mentions(text, p));
}

// Domains treated as official maritime-security or government publishers. A subdomain of an
// entry counts. Anything else is never OFFICIAL_SOURCE, whatever its text claims.
export const OFFICIAL_DOMAINS: readonly string[] = Object.freeze([
  'ukmto.org',
  'maritime.dot.gov',
  'marad.dot.gov',
  'imo.org',
  'nga.mil',
  'eia.gov',
]);

export type EventOrigin = 'aggregator' | 'direct';

/**
 * Source class from the URL host only. An aggregator (GDELT) item is a MEDIA_REPORT unless its
 * URL is on the official list; a direct item that is not official is UNVERIFIED_REPORT.
 * Requires https for the official class.
 */
export function classifySource(url: string, origin: EventOrigin): SourceClass {
  const host = hostnameOf(url);
  if (host !== null && url.trim().toLowerCase().startsWith('https://')) {
    if (OFFICIAL_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`)))
      return 'OFFICIAL_SOURCE';
  }
  return origin === 'aggregator' ? 'MEDIA_REPORT' : 'UNVERIFIED_REPORT';
}

export interface GeoMatch {
  readonly regionIds: string[];
  readonly regionName: string | null;
  readonly chokepointIds: string[];
  readonly location: GeoPoint | null;
}

/**
 * Finds places in the text. A chokepoint is only attached when its own name (or an alias of its
 * region that names it) appears, not merely because the region is mentioned. The location is the
 * first named chokepoint's point; otherwise null. Nothing is guessed.
 */
export function matchGeography(text: string): GeoMatch {
  const regions = findRegions(text);
  const chokepointIds: string[] = [];
  for (const c of CHOKEPOINTS) {
    if (mentions(text, c.name) || mentions(text, c.id.replace(/-/g, ' '))) chokepointIds.push(c.id);
  }
  // Region aliases that name a chokepoint directly.
  for (const r of regions) {
    for (const id of r.chokepointIds) {
      const c = getChokepoint(id);
      const named = r.aliases.some(
        (a) =>
          mentions(text, a) &&
          (a.includes('strait') ||
            a.includes('canal') ||
            a === 'hormuz' ||
            a === 'suez' ||
            a === 'malacca' ||
            a.includes('mandeb') ||
            a.includes('mandab')),
      );
      if (c !== undefined && named && !chokepointIds.includes(id)) chokepointIds.push(id);
    }
  }
  const first = chokepointIds[0] === undefined ? undefined : getChokepoint(chokepointIds[0]);
  return {
    regionIds: regions.map((r) => r.id),
    regionName: regions[0]?.name ?? null,
    chokepointIds,
    location: first === undefined ? null : { lat: first.lat, lon: first.lon },
  };
}

/** Port codes whose names appear in the text. `ports` comes from the database or seed. */
export function matchPorts(
  text: string,
  ports: ReadonlyArray<{ code: string; name: string }>,
): string[] {
  return ports.filter((p) => p.name.length >= 4 && mentions(text, p.name)).map((p) => p.code);
}

/** HIGH when geography and a hard category agree; MEDIUM with one of them; LOW otherwise. */
export function scoreRelevance(
  category: EventCategory,
  geo: GeoMatch,
  portCodes: readonly string[],
): Relevance {
  const placed = geo.chokepointIds.length > 0 || portCodes.length > 0;
  const hard =
    category !== 'SANCTIONS' && category !== 'ENERGY_SUPPLY' && category !== 'MARINE_WEATHER';
  if (placed && hard) return 'HIGH';
  if (placed || geo.regionIds.length > 0) return 'MEDIUM';
  return 'LOW';
}
