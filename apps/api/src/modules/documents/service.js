import { AppError } from '../../middleware/errorHandler.js';
import { recordAudit } from '../audit/service.js';
import { getShipmentRow } from '../shipments/service.js';
import { syncShipmentStatus } from '../shipments/statusSync.js';
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
  await syncShipmentStatus(db, userId, shipmentId, logger);
  return toDocumentView(row);
}

/** A document that says "processing" with no live job in this process, for longer than this. */
export const STALE_PROCESSING_MS = 120_000;
export const INTERRUPTED_MESSAGE = 'Processing was interrupted. Please try again.';

function isStale(row, now) {
  const started = Date.parse(row.processing_started_at ?? '');
  // No timestamp (a row from before this column existed) counts as stale.
  return Number.isNaN(started) || now - started > STALE_PROCESSING_MS;
}

/**
 * Marks documents stuck in 'processing' as failed, so the user can run them again.
 *
 * "Stuck" means: status is processing, no job for it is running in THIS process (`isActive`),
 * and it started more than STALE_PROCESSING_MS ago. That is what an API restart mid-job leaves
 * behind. It runs when documents are read, with the caller's own database client, so it needs
 * no admin key. The update only applies while the status is still 'processing'.
 *
 * Returns the rows with any recovered ones updated. Never throws for database problems.
 */
export async function failStaleDocuments(
  db,
  userId,
  rows,
  { isActive, now = Date.now(), logger = console } = {},
) {
  if (typeof isActive !== 'function') return rows;
  const out = [];
  const shipments = new Set();
  for (const row of rows) {
    if (row.processing_status !== 'processing' || isActive(row.id) || !isStale(row, now)) {
      out.push(row);
      continue;
    }
    const { data, error } = await db
      .from('documents')
      .update({ processing_status: 'failed', error_message: INTERRUPTED_MESSAGE })
      .eq('id', row.id)
      .eq('processing_status', 'processing')
      .select();
    if (error) {
      logger.error('document_stale_update_failed', { documentId: row.id, reason: error.message });
      out.push(row);
      continue;
    }
    if (!data || data.length === 0) {
      out.push(row); // someone else changed it first
      continue;
    }
    await auditSafely(
      db,
      {
        userId,
        shipmentId: row.shipment_id,
        action: 'document.processing_interrupted',
        details: { documentId: row.id },
      },
      logger,
    );
    shipments.add(row.shipment_id);
    out.push({ ...row, processing_status: 'failed', error_message: INTERRUPTED_MESSAGE });
  }
  for (const shipmentId of shipments) await syncShipmentStatus(db, userId, shipmentId, logger);
  return out;
}

export async function listDocuments(db, userId, shipmentId, recovery) {
  await requireShipment(db, userId, shipmentId);
  const { data, error } = await db
    .from('documents')
    .select('*')
    .eq('shipment_id', shipmentId)
    .order('created_at', { ascending: true });
  if (error) throw new AppError(500, 'DOCUMENT_LIST_FAILED', 'Could not load documents');
  const rows = await failStaleDocuments(db, userId, data ?? [], recovery);
  return rows.map(toDocumentView);
}

/** `recovery` is optional: { isActive, logger }. Without it, stuck documents are left alone. */
export async function getDocumentDetail(db, userId, id, recovery) {
  const found = await getDocumentRow(db, userId, id);
  const [row] = await failStaleDocuments(db, userId, [found], recovery);
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
export async function markProcessing(db, userId, id, logger = console) {
  const row = await getDocumentRow(db, userId, id);
  if (row.processing_status === 'reviewed') {
    throw new AppError(409, 'DOCUMENT_ALREADY_REVIEWED', 'This document was already reviewed');
  }
  const { data, error } = await db
    .from('documents')
    .update({
      processing_status: 'processing',
      error_message: null,
      processing_started_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('processing_status', row.processing_status)
    .select();
  if (error) throw new AppError(500, 'DOCUMENT_UPDATE_FAILED', 'Could not start processing');
  if (!data || data.length === 0) {
    throw new AppError(409, 'DOCUMENT_BUSY', 'This document is already being processed');
  }
  await syncShipmentStatus(db, userId, row.shipment_id, logger);
  return { ...row, processing_status: 'processing', error_message: null };
}

const REVIEWABLE = ['extracted', 'reviewed'];

const PARK_OFFSET = 1_000_000;
const goodsKey = (description) => String(description).trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Pairs each new line with an existing row that is the SAME GOODS (same description, ignoring
 * case and spacing), never with whatever row happens to sit at the same position. Duplicate
 * descriptions pair in line order. Returns { matches: [[oldRow|null, item]], unmatched: [oldRow] }.
 * A row that is paired keeps its id (and so its hs_suggestions and duty_estimates rows) even when
 * lines above it are removed or the lines are reordered. A line whose description was edited
 * counts as different goods: the old row is deleted and a new one inserted.
 */
export function matchLineItems(oldItems, items) {
  const pool = new Map();
  for (const old of [...oldItems].sort((a, b) => a.line_no - b.line_no)) {
    const key = goodsKey(old.description);
    if (!pool.has(key)) pool.set(key, []);
    pool.get(key).push(old);
  }
  const matches = items.map((item) => [
    pool.get(goodsKey(item.description))?.shift() ?? null,
    item,
  ]);
  return { matches, unmatched: [...pool.values()].flat() };
}

/**
 * Replaces the line items of one document without deleting rows that still exist, because
 * hs_suggestions and duty_estimates cascade from line_items.id (see matchLineItems for how rows
 * are paired). Matching rows are updated in place, new lines are inserted, and only rows whose
 * goods are gone are deleted, last (the cascade is intended there).
 *
 * (shipment_id, source_document_id, line_no) is unique, so rows that change line_no, and rows
 * about to be deleted, are first moved to a temporary line_no (PARK_OFFSET + old line_no).
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
  const { matches, unmatched } = matchLineItems(existing ?? [], items);
  const touched = []; // original copies of rows that were parked or updated
  const inserted = []; // line_no of rows this call inserted
  const deleted = []; // original copies of rows this call deleted

  const undo = async () => {
    const report = (step, error) => {
      if (error) logger.error('line_items_restore_failed', { documentId: id, step });
    };
    for (const lineNo of inserted) {
      const { error } = await db
        .from('line_items')
        .delete()
        .eq('shipment_id', row.shipment_id)
        .eq('source_document_id', id)
        .eq('line_no', lineNo);
      report('remove_inserted', error);
    }
    const gone = new Set(deleted.map((d) => d.id));
    const back = touched.filter((old) => !gone.has(old.id));
    for (const old of back) {
      const { error } = await db
        .from('line_items')
        .update({ line_no: PARK_OFFSET + old.line_no })
        .eq('id', old.id);
      report('park', error);
    }
    for (const old of back) {
      const { error } = await db.from('line_items').update(old).eq('id', old.id);
      report('revert_update', error);
    }
    for (const old of deleted) {
      const { error } = await db.from('line_items').insert(old);
      report('reinsert', error);
    }
  };

  const park = async (old) => {
    touched.push(old);
    const { error } = await db
      .from('line_items')
      .update({ line_no: PARK_OFFSET + old.line_no })
      .eq('id', old.id);
    if (error) throw fail();
  };

  try {
    for (const old of unmatched) await park(old);
    for (const [old, item] of matches) {
      if (old && old.line_no !== item.line_no) await park(old);
    }
    for (const [old, item] of matches) {
      if (old) {
        if (!touched.includes(old)) touched.push(old);
        const { error } = await db.from('line_items').update(item).eq('id', old.id);
        if (error) throw fail();
      } else {
        const { error } = await db.from('line_items').insert(item);
        if (error) throw fail();
        inserted.push(item.line_no);
      }
    }
    for (const old of unmatched) {
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
  await syncShipmentStatus(db, userId, row.shipment_id, logger);
  return getDocumentDetail(db, userId, id);
}
