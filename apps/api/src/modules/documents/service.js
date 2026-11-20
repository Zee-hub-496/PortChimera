import { AppError } from '../../middleware/errorHandler.js';
import { recordAudit } from '../audit/service.js';
import { getShipmentRow } from '../shipments/service.js';
import { buildStoragePath, sanitizeFilename, validateUpload } from './fileValidation.js';
import { buildLineItemRows, toDocumentDetailView, toDocumentView } from './documentView.js';

const UNIQUE_VIOLATION = '23505';
export const BUCKET = 'documents';
export const SIGNED_URL_SECONDS = 60;

/** Audit failures are logged, not fatal (same policy as createShipment). */
export async function auditSafely(db, entry, logger = console) {
  try {
    await recordAudit(db, entry);
  } catch (err) {
    logger.error('audit_write_failed', {
      action: entry.action,
      shipmentId: entry.shipmentId,
      userId: entry.userId,
      reason: err?.code ?? err?.message,
    });
  }
}

async function requireShipment(db, userId, shipmentId) {
  const shipment = await getShipmentRow(db, userId, shipmentId);
  if (!shipment) throw new AppError(404, 'SHIPMENT_NOT_FOUND', 'Shipment not found');
  return shipment;
}

/**
 * Returns the raw documents row when it exists AND its shipment is the caller's.
 * Row Level Security already hides other users' rows; the shipment check is a second lock.
 * @throws {AppError} 404 DOCUMENT_NOT_FOUND
 */
export async function getDocumentRow(db, userId, id) {
  const { data, error } = await db.from('documents').select('*').eq('id', id).maybeSingle();
  if (error) throw new AppError(500, 'DOCUMENT_LOOKUP_FAILED', 'Could not load the document');
  const shipment = data ? await getShipmentRow(db, userId, data.shipment_id) : null;
  if (!data || !shipment) throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
  return data;
}

async function getExtraction(db, documentId) {
  const { data, error } = await db
    .from('document_extractions')
    .select('*')
    .eq('document_id', documentId)
    .maybeSingle();
  if (error) throw new AppError(500, 'EXTRACTION_LOOKUP_FAILED', 'Could not load the extraction');
  return data ?? null;
}

/**
 * Upload order: validate -> storage upload -> insert row. If the insert fails the stored object
 * is removed (best effort) so no orphan files stay behind.
 */
export async function uploadDocument(
  db,
  userId,
  { shipmentId, documentType, buffer, filename },
  logger = console,
) {
  await requireShipment(db, userId, shipmentId);
  const { mime, sha256, size } = validateUpload({ buffer, documentType });
  const path = buildStoragePath(userId, shipmentId);

  const bucket = db.storage.from(BUCKET);
  const { error: uploadError } = await bucket.upload(path, buffer, {
    contentType: mime,
    upsert: false,
  });
  if (uploadError) throw new AppError(500, 'UPLOAD_FAILED', 'Could not store the file');

  const { data: row, error } = await db
    .from('documents')
    .insert({
      shipment_id: shipmentId,
      document_type: documentType,
      storage_path: path,
      original_filename: sanitizeFilename(filename) ?? 'unnamed',
      mime_type: mime,
      size_bytes: size,
      sha256,
    })
    .select()
    .single();
  if (error || !row) {
    try {
      await bucket.remove([path]);
    } catch (err) {
      logger.error('orphan_cleanup_failed', { shipmentId, reason: err?.message });
    }
    if (error?.code === UNIQUE_VIOLATION) {
      throw new AppError(
        409,
        'DOCUMENT_EXISTS',
        'This shipment already has a document of that type',
      );
    }
    throw new AppError(500, 'DOCUMENT_CREATE_FAILED', 'Could not save the document');
  }

  await auditSafely(
    db,
    {
      userId,
      shipmentId,
      action: 'document.uploaded',
      details: { documentId: row.id, documentType, mimeType: mime, sizeBytes: size },
    },
    logger,
  );
  return toDocumentView(row);
}

export async function listDocuments(db, userId, shipmentId) {
  await requireShipment(db, userId, shipmentId);
  const { data, error } = await db
    .from('documents')
    .select('*')
    .eq('shipment_id', shipmentId)
    .order('created_at', { ascending: true });
  if (error) throw new AppError(500, 'DOCUMENT_LIST_FAILED', 'Could not load documents');
  return (data ?? []).map(toDocumentView);
}

export async function getDocumentDetail(db, userId, id) {
  const row = await getDocumentRow(db, userId, id);
  return toDocumentDetailView(row, await getExtraction(db, id));
}

export async function createDownloadUrl(db, userId, id) {
  const row = await getDocumentRow(db, userId, id);
  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) {
    throw new AppError(500, 'DOWNLOAD_FAILED', 'Could not create a download link');
  }
  return { url: data.signedUrl, expiresInSeconds: SIGNED_URL_SECONDS };
}

/**
 * Marks the document as processing and returns the row for the background job.
 * The update only applies while the status is still the one that was read (compare and set), so
 * two overlapping requests cannot both start a job.
 */
export async function markProcessing(db, userId, id) {
  const row = await getDocumentRow(db, userId, id);
  if (row.processing_status === 'reviewed') {
    throw new AppError(409, 'DOCUMENT_ALREADY_REVIEWED', 'This document was already reviewed');
  }
  const { data, error } = await db
    .from('documents')
    .update({ processing_status: 'processing', error_message: null })
    .eq('id', id)
    .eq('processing_status', row.processing_status)
    .select();
  if (error) throw new AppError(500, 'DOCUMENT_UPDATE_FAILED', 'Could not start processing');
  if (!data || data.length === 0) {
    throw new AppError(409, 'DOCUMENT_BUSY', 'This document is already being processed');
  }
  return { ...row, processing_status: 'processing', error_message: null };
}

const REVIEWABLE = ['extracted', 'reviewed'];

/** Best effort: puts back the line items that a failed review replaced. */
async function restoreLineItems(db, row, id, oldItems, logger) {
  try {
    await db
      .from('line_items')
      .delete()
      .eq('shipment_id', row.shipment_id)
      .eq('source_document_id', id);
    if (oldItems.length > 0) await db.from('line_items').insert(oldItems);
  } catch (err) {
    logger.error('line_items_restore_failed', { documentId: id, reason: err?.message });
  }
}

/**
 * Saves the human-approved payload (already validated) and, for invoices, replaces the
 * line_items rows that came from this document.
 *
 * The review needs a settled document ('extracted' or 'reviewed'): not while a job runs, and not
 * after a failed re-run, because the stored extraction would no longer match the status.
 * There is no multi-statement transaction through the REST client, so the order is chosen to
 * fail safe: line items first (old rows are put back if anything later fails), then the
 * reviewed payload, then the status.
 */
export async function saveReview(db, userId, id, reviewedPayload, logger = console) {
  const row = await getDocumentRow(db, userId, id);
  if (!REVIEWABLE.includes(row.processing_status)) {
    throw new AppError(
      409,
      'DOCUMENT_NOT_EXTRACTED',
      row.processing_status === 'processing'
        ? 'Extraction is still running. Review it when it finishes.'
        : 'Run extraction successfully before reviewing',
    );
  }
  const extraction = await getExtraction(db, id);
  if (!extraction) {
    throw new AppError(409, 'DOCUMENT_NOT_EXTRACTED', 'Run extraction before reviewing');
  }

  let lineCount = 0;
  let oldItems = [];
  const isInvoice = row.document_type === 'commercial_invoice';
  if (isInvoice) {
    const items = buildLineItemRows({
      shipmentId: row.shipment_id,
      documentId: id,
      payload: reviewedPayload,
    });
    const { data: existing, error: readError } = await db
      .from('line_items')
      .select('*')
      .eq('shipment_id', row.shipment_id)
      .eq('source_document_id', id);
    if (readError) throw new AppError(500, 'LINE_ITEMS_FAILED', 'Could not update line items');
    oldItems = existing ?? [];
    const { error: delError } = await db
      .from('line_items')
      .delete()
      .eq('shipment_id', row.shipment_id)
      .eq('source_document_id', id);
    if (delError) throw new AppError(500, 'LINE_ITEMS_FAILED', 'Could not update line items');
    if (items.length > 0) {
      const { error: insError } = await db.from('line_items').insert(items);
      if (insError) {
        await restoreLineItems(db, row, id, oldItems, logger);
        throw new AppError(500, 'LINE_ITEMS_FAILED', 'Could not save line items');
      }
    }
    lineCount = items.length;
  }

  const { error: saveError } = await db
    .from('document_extractions')
    .update({ reviewed_payload: reviewedPayload, reviewed_at: new Date().toISOString() })
    .eq('document_id', id);
  if (saveError) {
    if (isInvoice) await restoreLineItems(db, row, id, oldItems, logger);
    throw new AppError(500, 'REVIEW_SAVE_FAILED', 'Could not save the review');
  }

  const { error: statusError } = await db
    .from('documents')
    .update({ processing_status: 'reviewed', error_message: null })
    .eq('id', id);
  if (statusError) throw new AppError(500, 'DOCUMENT_UPDATE_FAILED', 'Could not save the review');

  await auditSafely(
    db,
    {
      userId,
      shipmentId: row.shipment_id,
      action: 'document.reviewed',
      details: { documentId: id, documentType: row.document_type, lineItems: lineCount },
    },
    logger,
  );
  return getDocumentDetail(db, userId, id);
}
