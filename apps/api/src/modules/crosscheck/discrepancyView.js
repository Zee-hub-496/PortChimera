// Pure helpers: database rows <-> API view. No database, no Express.

/** A finding from crossCheck() as a `discrepancies` row (without shipment_id). */
export function findingToRow(finding) {
  return {
    finding_key: finding.key,
    category: finding.category,
    field_name: finding.field,
    severity: finding.severity,
    document_values: finding.values,
    difference: finding.difference ?? null,
    explanation: finding.explanation,
    recommended_action: finding.recommendedAction,
  };
}

export function toDiscrepancyView(row) {
  return {
    id: row.id,
    shipmentId: row.shipment_id,
    key: row.finding_key ?? null,
    field: row.field_name,
    category: row.category ?? null,
    severity: row.severity,
    documents: Object.keys(row.document_values ?? {}),
    values: row.document_values ?? {},
    difference: row.difference ?? null,
    explanation: row.explanation,
    recommendedAction: row.recommended_action,
    reviewStatus: row.review_status ?? 'open',
    reviewedAt: row.reviewed_at ?? null,
    createdAt: row.created_at,
  };
}

const SAME = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Decides what a re-run does (spec 04, R5.2).
 * - new finding, no stored row: insert
 * - stored row still open: update it with the fresh values
 * - stored row already decided (accepted, resolved, dismissed) and the compared values are the
 *   same: leave it untouched
 * - decided row whose compared values or difference changed: update it and reopen it, so an old
 *   decision never sits beside figures that no document contains any more
 * - open stored row whose finding no longer appears: delete it
 * - decided stored row whose finding no longer appears: keep it (the decision is history)
 *
 * @param {Array<object>} stored existing rows for the shipment
 * @param {Array<object>} fresh rows from findingToRow()
 */
export function planRerun(stored, fresh) {
  const byKey = new Map(stored.filter((r) => r.finding_key).map((r) => [r.finding_key, r]));
  const freshKeys = new Set(fresh.map((r) => r.finding_key));
  const insert = [];
  const update = [];
  for (const row of fresh) {
    const old = byKey.get(row.finding_key);
    if (!old) insert.push(row);
    else if ((old.review_status ?? 'open') === 'open') {
      const changed = Object.keys(row).some((k) => !SAME(row[k], old[k]));
      if (changed) update.push({ id: old.id, values: row });
    } else if (
      !SAME(row.document_values, old.document_values) ||
      !SAME(row.difference, old.difference)
    ) {
      update.push({
        id: old.id,
        values: { ...row, review_status: 'open', reviewed_by: null, reviewed_at: null },
      });
    }
  }
  const remove = stored
    .filter((r) => (r.review_status ?? 'open') === 'open' && !freshKeys.has(r.finding_key))
    .map((r) => r.id);
  return { insert, update, remove };
}
