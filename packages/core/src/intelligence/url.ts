const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|ref_src$|cmpid$|ocid$)/i;

/**
 * Canonical form of an article URL for de-duplication: lower-case host without "www.",
 * no fragment, no tracking parameters, sorted query, no trailing slash. Returns null for
 * anything that is not a valid http(s) URL.
 */
export function normalizeUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (host === '') return null;
  const keep = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAMS.test(k))
    .sort(([a], [b]) => a.localeCompare(b));
  const query = new URLSearchParams(keep).toString();
  const path = u.pathname.replace(/\/+$/, '');
  return `${host}${path}${query ? `?${query}` : ''}`;
}

/** Lower-case, accents and punctuation removed, spaces collapsed. For title comparison. */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Deterministic short id from a normalized URL (FNV-1a, 32 bit, hex). Not a security hash. */
export function stableId(normalizedUrl: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < normalizedUrl.length; i++) {
    h ^= normalizedUrl.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Hostname without "www.", or null when the URL is invalid. */
export function hostnameOf(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Removes duplicates by normalized URL or normalized title. The first item of each group wins,
 * so sort the input first if one source should be preferred.
 */
export function dedupe<T extends { url: string; headline: string }>(items: readonly T[]): T[] {
  const urls = new Set<string>();
  const titles = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const u = normalizeUrl(item.url);
    const t = normalizeTitle(item.headline);
    if (u === null || t === '') continue;
    if (urls.has(u) || titles.has(t)) continue;
    urls.add(u);
    titles.add(t);
    out.push(item);
  }
  return out;
}
