// Pure breadcrumb builder for the app top bar. No React, so node:test can run it.

const PAGE_LABELS = Object.freeze({
  dashboard: 'Dashboard',
  shipments: 'Shipments',
  map: 'Global Map',
  documents: 'Documents',
  alerts: 'Alerts',
  settings: 'Settings',
});

const TAB_LABELS = Object.freeze({
  documents: 'Documents',
  'cross-check': 'Cross-check',
  route: 'Route',
});

/**
 * Breadcrumb trail for an app pathname. The last item has no `to` (current page).
 * @param {string} pathname
 * @param {Record<string, string>} [shipmentNumbers] shipment id to number, when known
 * @returns {Array<{label: string, to?: string}>}
 */
export function buildBreadcrumbs(pathname, shipmentNumbers = {}) {
  const parts = String(pathname ?? '')
    .split('/')
    .filter(Boolean);
  if (parts.length === 0) return [{ label: 'Home' }];
  const [first, id, tab] = parts;
  const crumbs = [];
  if (first === 'shipments' && id) {
    crumbs.push({ label: 'Shipments', to: '/shipments' });
    crumbs.push({ label: shipmentNumbers[id] ?? 'Shipment', to: `/shipments/${id}` });
    if (tab) crumbs.push({ label: TAB_LABELS[tab] ?? tab });
  } else {
    crumbs.push({ label: PAGE_LABELS[first] ?? first });
  }
  // Only the final crumb is the current page.
  const last = crumbs.length - 1;
  return crumbs.map((c, i) => (i === last ? { label: c.label } : c));
}
