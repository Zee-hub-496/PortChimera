import { AppError } from '../../middleware/errorHandler.js';
import { auditSafely } from '../documents/service.js';
import { getShipmentRow } from '../shipments/service.js';
import { findingToRow, planRerun, toDiscrepancyView } from './discrepancyView.js';
import { mapReviewedPayloads } from './mapPayloads.js';

async function requireShipment(db, userId, shipmentId) {
  const shipment = await getShipmentRow(db, userId, shipmentId);
  if (!shipment) throw new AppError(404, 'SHIPMENT_NOT_FOUND', 'Shipment not found');
  return shipment;
}

const SAVE_FAILED = ['DISCREPANCY_SAVE_FAILED', 'Could not save the cross-check'];

// Postgres 23505 = unique violation: another run stored the same finding first.
function saveError(error) {
  if (error?.code === '23505') {
    return new AppError(
      409,
      'CROSS_CHECK_IN_PROGRESS',
      'Another cross-check is running for this shipment. Try again in a moment.',
    );
  }
  return new AppError(500, ...SAVE_FAILED);
}

async function loadStored(db, shipmentId) {
  const { data, error } = await db
    .from('discrepancies')
    .select('*')
    .eq('shipment_id', shipmentId)
    .order('created_at', { ascending: true });
  if (error) throw new AppError(500, 'DISCREPANCY_LIST_FAILED', 'Could not load discrepancies');
  return data ?? [];
}

async function loadReviewedDocuments(db, shipmentId) {
  const { data: docs, error } = await db
    .from('documents')
    .select('id, document_type')
    .eq('shipment_id', shipmentId)
    // Newest first: when a shipment has two documents of one type, the mapper uses the newest
    // reviewed one, so the choice is the same on every run.
    .order('created_at', { ascending: false });
  if (error) throw new AppError(500, 'DOCUMENT_LIST_FAILED', 'Could not load documents');
  const ids = (docs ?? []).map((d) => d.id);
  if (ids.length === 0) return [];
  const { data: extractions, error: exError } = await db
    .from('document_extractions')
    .select('document_id, reviewed_payload')
    .in('document_id', ids);
  if (exError) throw new AppError(500, 'EXTRACTION_LOOKUP_FAILED', 'Could not load the reviews');
  const payloadByDoc = new Map((extractions ?? []).map((e) => [e.document_id, e.reviewed_payload]));
  return docs.map((d) => ({
    document_type: d.document_type,
    reviewed_payload: payloadByDoc.get(d.id) ?? null,
  }));
}

function storedSummary(shipment) {
  return shipment.cross_check_summary ?? null;
}

async function view(db, shipment) {
  return {
    discrepancies: (await loadStored(db, shipment.id)).map(toDiscrepancyView),
    summary: storedSummary(shipment),
    checkedAt: shipment.cross_checked_at ?? null,
  };
}

/**
 * `engine` is `{ crossCheck }` from @portchimera/core (injected so tests need no workspace link).
 * Runs the deterministic cross-check on the reviewed documents of one shipment and stores the
 * findings. Open findings are replaced; decided ones are kept (see planRerun).
 * The writes are separate statements, not one transaction. A failure part-way leaves the stored
 * findings and the summary out of step; running the check again repairs it (the plan is computed
 * from the stored rows each time). Overlapping runs that collide on the unique key get a 409.
 * Audit failures are logged, not fatal (same policy as the documents module).
 */
export async function runCrossCheck(db, userId, shipmentId, engine, logger = console) {
  const shipment = await requireShipment(db, userId, shipmentId);
  const documents = mapReviewedPayloads(await loadReviewedDocuments(db, shipmentId));
  const { findings, summary } = engine.crossCheck(documents);

  const plan = planRerun(
    await loadStored(db, shipmentId),
    findings.map((f) => ({ shipment_id: shipmentId, ...findingToRow(f) })),
  );
  if (plan.remove.length > 0) {
    const { error } = await db.from('discrepancies').delete().in('id', plan.remove);
    if (error) throw saveError(error);
  }
  for (const { id, values } of plan.update) {
    const { error } = await db.from('discrepancies').update(values).eq('id', id);
    if (error) throw saveError(error);
  }
  if (plan.insert.length > 0) {
    const { error } = await db.from('discrepancies').insert(plan.insert);
    if (error) throw saveError(error);
  }

  const checkedAt = new Date().toISOString();
  const { error: summaryError } = await db
    .from('shipments')
    .update({ cross_check_summary: summary, cross_checked_at: checkedAt })
    .eq('id', shipmentId);
  if (summaryError) throw saveError(summaryError);

  await auditSafely(
    db,
    {
      userId,
      shipmentId,
      action: 'crosscheck.run',
      details: {
        findings: findings.length,
        overall: summary.overall,
        added: plan.insert.length,
        updated: plan.update.length,
        removed: plan.remove.length,
        reopened: plan.update.filter((u) => u.values.review_status === 'open').length,
      },
    },
    logger,
  );
  return view(db, { ...shipment, cross_check_summary: summary, cross_checked_at: checkedAt });
}

export async function listDiscrepancies(db, userId, shipmentId) {
  return view(db, await requireShipment(db, userId, shipmentId));
}

/** Records the user's decision on one discrepancy. */
export async function decideDiscrepancy(db, userId, id, reviewStatus, logger = console) {
  const { data: row, error } = await db
    .from('discrepancies')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new AppError(500, 'DISCREPANCY_LOOKUP_FAILED', 'Could not load the discrepancy');
  const shipment = row ? await getShipmentRow(db, userId, row.shipment_id) : null;
  if (!row || !shipment) throw new AppError(404, 'DISCREPANCY_NOT_FOUND', 'Discrepancy not found');

  const reviewedAt = new Date().toISOString();
  const { error: updateError } = await db
    .from('discrepancies')
    .update({ review_status: reviewStatus, reviewed_by: userId, reviewed_at: reviewedAt })
    .eq('id', id);
  if (updateError) {
    throw new AppError(500, 'DISCREPANCY_UPDATE_FAILED', 'Could not save the decision');
  }

  await auditSafely(
    db,
    {
      userId,
      shipmentId: row.shipment_id,
      action: 'discrepancy.reviewed',
      details: {
        discrepancyId: id,
        field: row.field_name,
        from: row.review_status ?? 'open',
        to: reviewStatus,
      },
    },
    logger,
  );
  return toDiscrepancyView({
    ...row,
    review_status: reviewStatus,
    reviewed_by: userId,
    reviewed_at: reviewedAt,
  });
}
