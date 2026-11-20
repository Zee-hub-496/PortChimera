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

/**
 * Replaces the line items of one document without deleting rows that still exist, because
 * hs_suggestions and duty_estimates cascade from line_items.id. Rows are matched by line_no
 * (unique per shipment and document): matching rows are updated in place, new lines are
 * inserted, and only rows whose line_no is gone are deleted (the cascade is intended there).
 *
 * Returns an undo function. Undo is best effort and logs `line_items_restore_failed` for every
 * step whose returned `error` is set (supabase-js does not throw for database errors).
 */
async function syncLineItems(db, row, id, items, logger) {
  const fail = () => new AppError(500, 'LINE_ITEMS_FAILED', 'Could not update line items');
  const { data: existing, error: readError } = await db
    .from('line_items')
    .select('*')
    .eq('shipment_id', row.shipment_id)
    .eq('source_document_id', id);
  if (readError) throw fail();
  const oldItems = existing ?? [];
  const oldByNo = new Map(oldItems.map((o) => [o.line_no, o]));
  const newNos = new Set(items.map((i) => i.line_no));
  const updated = [];
  const inserted = [];
  const deleted = [];

  const undo = async () => {
    const report = (step, error) => {
      if (error) logger.error('line_items_restore_failed', { documentId: id, step });
    };
    for (const old of deleted) {
      const { error } = await db.from('line_items').insert(old);
      report('reinsert', error);
    }
    for (const lineNo of inserted) {
      const { error } = await db
        .from('line_items')
        .delete()
        .eq('shipment_id', row.shipment_id)
        .eq('source_document_id', id)
        .eq('line_no', lineNo);
      report('remove_inserted', error);
    }
    for (const old of updated) {
      const { error } = await db.from('line_items').update(old).eq('id', old.id);
      report('revert_update', error);
    }
  };

  try {
    for (const item of items) {
      const old = oldByNo.get(item.line_no);
      if (old) {
        const { error } = await db.from('line_items').update(item).eq('id', old.id);
        if (error) throw fail();
        updated.push(old);
      } else {
        const { error } = await db.from('line_items').insert(item);
        if (error) throw fail();
        inserted.push(item.line_no);
      }
    }
    for (const old of oldItems) {
      if (newNos.has(old.line_no)) continue;
      const { error } = await db.from('line_items').delete().eq('id', old.id);
      if (error) throw fail();
      deleted.push(old);
    }
  } catch (err) {
    await undo();
    throw err;
  }
  return undo;
}

/**
 * Saves the human-approved payload (already validated) and, for invoices, replaces the
 * line_items rows that came from this document.
 *
 * The review needs a settled document ('extracted' or 'reviewed'): not while a job runs, and not
 * after a failed re-run, because the stored extraction would no longer match the status.
 * There is no multi-statement transaction through the REST client, so the order is chosen to
 * fail safe: line items first (changes are undone if anything later fails), then the
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
  let undoLineItems = null;
  if (row.document_type === 'commercial_invoice') {
    const items = buildLineItemRows({
      shipmentId: row.shipment_id,
      documentId: id,
      payload: reviewedPayload,
    });
    undoLineItems = await syncLineItems(db, row, id, items, logger);
    lineCount = items.length;
  }

  const { error: saveError } = await db
    .from('document_extractions')
    .update({ reviewed_payload: reviewedPayload, reviewed_at: new Date().toISOString() })
    .eq('document_id', id);
  if (saveError) {
    if (undoLineItems) await undoLineItems();
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
