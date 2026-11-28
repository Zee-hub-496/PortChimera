import { wrapLon } from '../geo/geo.ts';

/** A named sea area. The box is [minLon, minLat, maxLon, maxLat] and is deliberately coarse. */
export interface Region {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly box: readonly [number, number, number, number];
  /** Chokepoints inside or defining the region. A mention of the region does not imply them. */
  readonly chokepointIds: readonly string[];
}

export const REGIONS: readonly Region[] = Object.freeze([
  {
    id: 'persian-gulf',
    name: 'Persian Gulf',
    aliases: ['persian gulf', 'arabian gulf', 'gulf of oman', 'strait of hormuz', 'hormuz'],
    box: [47, 23.5, 60, 30.5],
    chokepointIds: ['hormuz'],
  },
  {
    id: 'red-sea',
    name: 'Red Sea',
    aliases: [
      'red sea',
      'bab el mandeb',
      'bab al mandab',
      'bab-el-mandeb',
      'gulf of aden',
      'houthi',
    ],
    box: [32, 11, 45, 30],
    chokepointIds: ['bab-el-mandeb'],
  },
  {
    id: 'suez',
    name: 'Suez Canal',
    aliases: ['suez canal', 'suez'],
    box: [31.5, 29.5, 33, 31.5],
    chokepointIds: ['suez'],
  },
  {
    id: 'mediterranean',
    name: 'Mediterranean',
    aliases: ['mediterranean', 'strait of gibraltar', 'gibraltar'],
    box: [-6, 30, 36, 46],
    chokepointIds: ['gibraltar'],
  },
  {
    id: 'south-east-asia',
    name: 'Malacca and Singapore Straits',
    aliases: ['strait of malacca', 'malacca strait', 'singapore strait', 'malacca'],
    box: [95, -1, 105, 7],
    chokepointIds: ['malacca'],
  },
  {
    id: 'south-china-sea',
    name: 'South China Sea and Taiwan Strait',
    aliases: ['south china sea', 'taiwan strait'],
    box: [105, 5, 122, 26],
    chokepointIds: ['taiwan'],
  },
  {
    id: 'north-europe',
    name: 'English Channel and North Sea',
    aliases: ['english channel', 'strait of dover', 'north sea'],
    box: [-5, 49, 9, 58],
    chokepointIds: ['dover'],
  },
  {
    id: 'southern-africa',
    name: 'Cape of Good Hope',
    aliases: ['cape of good hope', 'cape town'],
    box: [10, -38, 30, -30],
    chokepointIds: ['cape-good-hope'],
  },
  {
    id: 'black-sea',
    name: 'Black Sea',
    aliases: ['black sea', 'bosphorus', 'odesa', 'odessa'],
    box: [27, 40, 42, 47],
    chokepointIds: [],
  },
]);

export const regionById = (id: string): Region | undefined => REGIONS.find((r) => r.id === id);

/** True when the point lies in the region's box. */
export function regionContains(region: Region, lon: number, lat: number): boolean {
  const [minLon, minLat, maxLon, maxLat] = region.box;
  const l = wrapLon(lon);
  return l >= minLon && l <= maxLon && lat >= minLat && lat <= maxLat;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whole-word, case-insensitive phrase search. */
export function mentions(text: string, phrase: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRe(phrase)}([^a-z0-9]|$)`, 'i').test(text);
}

/** Regions whose names or aliases appear in the text, in gazetteer order. */
export function findRegions(text: string): Region[] {
  return REGIONS.filter((r) => r.aliases.some((a) => mentions(text, a)));
}
