// Pure ranking for the global search (Ctrl+K). cmdk only renders the list;
// ranking comes from here, so the component runs with shouldFilter={false}.

/**
 * @typedef {{ id: string, label: string, hint?: string, to: string, group: string, keywords?: string[] }} SearchItem
 */

/**
 * Ranks items: label prefix, then label substring, then hint/keyword match.
 * An empty query returns the items unchanged.
 * @param {SearchItem[]} items
 * @param {string} query
 * @param {number} [limit]
 * @returns {SearchItem[]}
 */
export function searchItems(items, query, limit = 50) {
  const q = String(query ?? '')
    .trim()
    .toLowerCase();
  if (!q) return items.slice(0, limit);
  const scored = [];
  items.forEach((item, index) => {
    const label = item.label.toLowerCase();
    let score = 0;
    if (label.startsWith(q)) score = 3;
    else if (label.includes(q)) score = 2;
    else {
      const rest = [item.hint ?? '', ...(item.keywords ?? [])].map((s) => s.toLowerCase());
      if (rest.some((s) => s.includes(q))) score = 1;
    }
    if (score > 0) scored.push({ item, score, index });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, limit).map((s) => s.item);
}

/**
 * Search items for the user's shipments (shape returned by GET /api/shipments).
 * @param {Array<{id: string, shipmentNumber: string, origin?: {name: string}|null, destination?: {name: string}|null, status?: string}>} shipments
 * @returns {SearchItem[]}
 */
export function buildShipmentItems(shipments) {
  return (shipments ?? []).map((s) => {
    const route = [s.origin?.name, s.destination?.name].filter(Boolean).join(' to ');
    return {
      id: `shipment:${s.id}`,
      label: s.shipmentNumber,
      hint: route,
      to: `/shipments/${s.id}`,
      group: 'Shipments',
      keywords: [s.status ?? '', s.origin?.name ?? '', s.destination?.name ?? ''].filter(Boolean),
    };
  });
}

/**
 * Search items for ports (shape returned by GET /api/ports).
 * @param {Array<{code: string, name: string, country?: string}>} ports
 * @returns {SearchItem[]}
 */
export function buildPortItems(ports) {
  return (ports ?? []).map((p) => ({
    id: `port:${p.code}`,
    label: p.name,
    hint: p.country ? `${p.code} · ${p.country}` : p.code,
    to: `/map?port=${encodeURIComponent(p.code)}`,
    group: 'Ports',
    keywords: [p.code, p.country ?? ''].filter(Boolean),
  }));
}

/**
 * Page entries. Signed-out visitors only see public pages.
 * @param {boolean} isSignedIn
 * @returns {SearchItem[]}
 */
export function PAGE_ITEMS(isSignedIn) {
  const pub = [
    { id: 'page:home', label: 'Home', to: '/', keywords: ['landing'] },
    { id: 'page:login', label: 'Log in', to: '/login', keywords: ['sign in'] },
    {
      id: 'page:register',
      label: 'Register',
      to: '/register',
      keywords: ['sign up', 'create account'],
    },
  ];
  const app = [
    { id: 'page:dashboard', label: 'Dashboard', to: '/dashboard', keywords: ['overview'] },
    { id: 'page:shipments', label: 'Shipments', to: '/shipments', keywords: ['list'] },
    { id: 'page:map', label: 'Global Map', to: '/map', keywords: ['ports'] },
    { id: 'page:documents', label: 'Documents', to: '/documents', keywords: ['upload'] },
    {
      id: 'page:alerts',
      label: 'Alerts',
      to: '/alerts',
      keywords: ['discrepancies', 'cross-check'],
    },
    {
      id: 'page:crisis',
      label: 'Crisis monitor',
      to: '/crisis',
      keywords: ['simulation', 'disruption', 'port strike', 'reroute'],
    },
    {
      id: 'page:world-monitor',
      label: 'World Monitor',
      to: '/intelligence/world-monitor',
      keywords: ['news', 'maritime', 'incidents', 'piracy', 'red sea', 'intelligence'],
    },
    {
      id: 'page:energy-watch',
      label: 'Energy Watch',
      to: '/intelligence/energy',
      keywords: ['brent', 'oil', 'price', 'crude', 'intelligence'],
    },
    { id: 'page:settings', label: 'Settings', to: '/settings', keywords: ['theme', 'account'] },
  ];
  return (isSignedIn ? app.concat(pub.slice(0, 1)) : pub).map((p) => ({ ...p, group: 'Pages' }));
}

/**
 * Filters shipments by number, port names or status.
 * @param {Array<object>} list
 * @param {string} query
 */
export function filterShipments(list, query) {
  const items = buildShipmentItems(list);
  const hits = new Set(searchItems(items, query, Infinity).map((i) => i.id));
  return (list ?? []).filter((s) => hits.has(`shipment:${s.id}`));
}
