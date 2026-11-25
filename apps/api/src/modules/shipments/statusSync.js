import { deriveShipmentStatus } from '@portchimera/core';
import { recordAudit } from '../audit/service.js';
import { getShipmentRow } from './service.js';

/** Statuses a person set. The derivation never overwrites them. */
const HUMAN_STATUSES = ['cleared'];

/** The documents and findings that decide a shipment's status. Throws on a database error. */
export async function loadFacts(db, shipmentId) {
  const { data: docs, error: docError } = await db
    .from('documents')
    .select('id, document_type, processing_status')
    .eq('shipment_id', shipmentId);
  if (docError) throw new Error('document_lookup_failed');
  const ids = (docs ?? []).map((d) => d.id);

  let reviewedAtById = new Map();
  if (ids.length > 0) {
    const { data: extractions, error: exError } = await db
      .from('document_extractions')
      .select('document_id, reviewed_at')
      .in('document_id', ids);
    if (exError) throw new Error('extraction_lookup_failed');
    reviewedAtById = new Map((extractions ?? []).map((e) => [e.document_id, e.reviewed_at]));
  }

  const { data: findings, error: findingError } = await db
    .from('discrepancies')
    .select('review_status')
    .eq('shipment_id', shipmentId);
  if (findingError) throw new Error('discrepancy_lookup_failed');

  return {
    documents: (docs ?? []).map((d) => ({
      documentType: d.document_type,
      processingStatus: d.processing_status,
      reviewedAt: reviewedAtById.get(d.id) ?? null,
    })),
    discrepancies: (findings ?? []).map((f) => ({ reviewStatus: f.review_status ?? 'open' })),
  };
}

/**
 * Recomputes a shipment's status from its documents and discrepancies and stores it when it
 * changed. The decision itself lives in `deriveShipmentStatus` (packages/core); this function only
 * loads the facts and writes the result. Call it after anything that can change the status:
 * upload, extraction start/finish/failure, review, cross-check, and a discrepancy decision.
 *
 * It never throws. A failure here must not undo the user's real action (the review, the upload),
 * so it is logged (ids and reason only) and the next event recomputes the status.
 * The reads and the write are separate calls, so two events at the same moment can briefly leave
 * an older result; the next event corrects it.
 *
 * @returns {Promise<string|null>} the stored status, or null when it could not be updated
 */
export async function syncShipmentStatus(db, userId, shipmentId, logger = console) {
  try {
    const shipment = await getShipmentRow(db, userId, shipmentId);
    if (!shipment) return null;
    if (HUMAN_STATUSES.includes(shipment.status)) return shipment.status;

    const facts = await loadFacts(db, shipmentId);
    const next = deriveShipmentStatus({
      ...facts,
      crossCheckedAt: shipment.cross_checked_at ?? null,
    });
    if (next === shipment.status) return next;

    const { error } = await db
      .from('shipments')
      .update({ status: next })
      .eq('id', shipmentId)
      .eq('user_id', userId);
    if (error) throw new Error('status_update_failed');

    try {
      await recordAudit(db, {
        userId,
        shipmentId,
        action: 'shipment.status_changed',
        details: { from: shipment.status, to: next },
      });
    } catch (err) {
      logger.error('audit_write_failed', {
        action: 'shipment.status_changed',
        shipmentId,
        userId,
        reason: err?.code ?? err?.message,
      });
    }
    return next;
  } catch (err) {
    logger.error('shipment_status_sync_failed', { shipmentId, userId, reason: err?.message });
    return null;
  }
}
