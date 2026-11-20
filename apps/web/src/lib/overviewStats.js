// Pure dashboard helpers. Statuses match the shipments.status check in the database.
export const STATUS_LABELS = Object.freeze({
  submitted: 'Submitted',
  ai_processing: 'AI processing',
  requires_review: 'Requires review',
  ai_pre_cleared: 'AI pre-cleared',
  cleared: 'Cleared',
});

const TONES = Object.freeze({
  submitted: 'neutral',
  ai_processing: 'info',
  requires_review: 'warn',
  ai_pre_cleared: 'success',
  cleared: 'success',
});

/**
 * Badge tone for a shipment status. Unknown values are neutral.
 * @param {string} status
 * @returns {'neutral'|'info'|'success'|'warn'|'danger'}
 */
export function statusTone(status) {
  return TONES[status] ?? 'neutral';
}

/**
 * Counts shipments for the dashboard.
 * @param {Array<{status?: string, origin?: {code: string}|null, destination?: {code: string}|null}>} shipments
 * @returns {{total: number, byStatus: Record<string, number>, needsReview: number, portCount: number}}
 */
export function summarizeShipments(shipments) {
  const list = shipments ?? [];
  const byStatus = Object.fromEntries(Object.keys(STATUS_LABELS).map((k) => [k, 0]));
  const ports = new Set();
  for (const s of list) {
    if (s.status in byStatus) byStatus[s.status] += 1;
    if (s.origin?.code) ports.add(s.origin.code);
    if (s.destination?.code) ports.add(s.destination.code);
  }
  return {
    total: list.length,
    byStatus,
    needsReview: byStatus.requires_review,
    portCount: ports.size,
  };
}
