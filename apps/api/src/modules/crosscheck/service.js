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
    .eq('shipment_id', shipmentId);
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
    if (error) throw new AppError(500, 'DISCREPANCY_SAVE_FAILED', 'Could not save the cross-check');
  }
  for (const { id, values } of plan.update) {
    const { error } = await db.from('discrepancies').update(values).eq('id', id);
    if (error) throw new AppError(500, 'DISCREPANCY_SAVE_FAILED', 'Could not save the cross-check');
  }
  if (plan.insert.length > 0) {
    const { error } = await db.from('discrepancies').insert(plan.insert);
    if (error) throw new AppError(500, 'DISCREPANCY_SAVE_FAILED', 'Could not save the cross-check');
  }

  const checkedAt = new Date().toISOString();
  const { error: summaryError } = await db
    .from('shipments')
    .update({ cross_check_summary: summary, cross_checked_at: checkedAt })
    .eq('id', shipmentId);
  if (summaryError) {
    throw new AppError(500, 'DISCREPANCY_SAVE_FAILED', 'Could not save the cross-check');
  }

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
