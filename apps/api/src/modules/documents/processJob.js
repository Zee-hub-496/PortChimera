import { createHash } from 'node:crypto';
import { extractPdfText } from '../../ai/pdfText.js';
import { SCHEMA_VERSION } from '../../ai/fieldNames.js';
import { runExtraction } from './extractionRunner.js';
import { auditSafely } from './service.js';

const SAFE_MESSAGES = Object.freeze({
  timeout: 'The AI service took too long. Please try again.',
  rate_limited: 'The AI service is busy. Please try again in a minute.',
  upstream: 'The AI service had a problem. Please try again.',
  bad_output: 'The AI answer could not be validated, so it was discarded. Please try again.',
  auth: 'The AI service is not set up correctly. Contact the administrator.',
});
const GENERIC_MESSAGE = 'Extraction failed. Please try again.';

/** The only text that is ever stored or shown after a failure: fixed strings, never raw errors. */
export function safeErrorMessage(err) {
  return SAFE_MESSAGES[err?.kind] ?? GENERIC_MESSAGE;
}

/** Looks for an earlier extraction of the same file and type that this user can see. */
async function findCachedExtraction(db, doc) {
  const { data: same, error } = await db
    .from('documents')
    .select('id')
    .eq('sha256', doc.sha256)
    .eq('document_type', doc.document_type);
  if (error) return null;
  const ids = (same ?? []).map((d) => d.id).filter((id) => id !== doc.id);
  if (ids.length === 0) return null;
  const { data, error: exError } = await db
    .from('document_extractions')
    .select('document_id, payload, model, schema_version')
    .in('document_id', ids);
  if (exError) return null;
  return (data ?? []).find((e) => e.schema_version === SCHEMA_VERSION) ?? null;
}

async function saveExtraction(db, doc, { payload, model }) {
  // Only write while this job still owns the document, and never over a reviewed extraction.
  const { data: current, error: curError } = await db
    .from('documents')
    .select('processing_status')
    .eq('id', doc.id)
    .maybeSingle();
  if (curError || current?.processing_status !== 'processing') throw new Error('job_superseded');
  const { data: old, error: oldError } = await db
    .from('document_extractions')
    .select('reviewed_at')
    .eq('document_id', doc.id)
    .maybeSingle();
  if (oldError) throw new Error('extraction_lookup_failed');
  if (old?.reviewed_at) throw new Error('job_superseded');
  // A re-run replaces the old extraction (document_id is unique).
  const { error: delError } = await db
    .from('document_extractions')
    .delete()
    .eq('document_id', doc.id);
  if (delError) throw new Error('extraction_delete_failed');
  const { error } = await db.from('document_extractions').insert({
    document_id: doc.id,
    payload,
    model,
    schema_version: SCHEMA_VERSION,
  });
  if (error) throw new Error('extraction_insert_failed');
  const { error: statusError } = await db
    .from('documents')
    .update({ processing_status: 'extracted', error_message: null })
    .eq('id', doc.id)
    .eq('processing_status', 'processing');
  if (statusError) throw new Error('status_update_failed');
}

async function markFailed(db, userId, doc, err, logger) {
  const message = safeErrorMessage(err);
  try {
    await db
      .from('documents')
      .update({ processing_status: 'failed', error_message: message })
      .eq('id', doc.id)
      .eq('processing_status', 'processing');
  } catch (updateErr) {
    logger.error('document_fail_update_failed', { documentId: doc.id, reason: updateErr?.message });
  }
  await auditSafely(
    db,
    {
      userId,
      shipmentId: doc.shipment_id,
      action: 'document.extraction_failed',
      details: { documentId: doc.id, reason: err?.kind ?? 'internal' },
    },
    logger,
  );
}

/**
 * Background extraction for one document. Never throws: every failure ends as a 'failed'
 * document with a safe message, and the real reason goes only to the server log.
 *
 * @param {object} p
 * @param {object} p.db user-scoped database client (RLS applies)
 * @param {object} p.doc documents row
 * @param {object} p.provider AI provider (see ai/aiProvider.js)
 * @param {Function} p.parse (documentType, raw) => validated payload, throws on bad output
 * @param {object} p.storage storage bucket client (download)
 */
export async function runJob({ db, userId, doc, provider, parse, logger = console, storage }) {
  try {
    const { data: blob, error: dlError } = await storage.download(doc.storage_path);
    if (dlError || !blob) throw new Error('download_failed');
    const bytes = Buffer.from(await blob.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== doc.sha256) {
      throw new Error('stored_file_changed');
    }

    const cached = await findCachedExtraction(db, doc);
    if (cached) {
      await saveExtraction(db, doc, { payload: cached.payload, model: `cache:${cached.model}` });
      await auditSafely(
        db,
        {
          userId,
          shipmentId: doc.shipment_id,
          action: 'document.extracted',
          details: { documentId: doc.id, cached: true, model: cached.model },
        },
        logger,
      );
      return { status: 'extracted', cached: true };
    }

    const text = doc.mime_type === 'application/pdf' ? extractPdfText(bytes) : '';
    const result = await runExtraction({
      provider,
      parse,
      documentType: doc.document_type,
      bytes,
      mime: doc.mime_type,
      text,
    });
    await saveExtraction(db, doc, result);
    await auditSafely(
      db,
      {
        userId,
        shipmentId: doc.shipment_id,
        action: 'document.extracted',
        details: {
          documentId: doc.id,
          cached: false,
          model: result.model,
          evidenceCheck: result.evidenceCheck,
        },
      },
      logger,
    );
    return { status: 'extracted', cached: false };
  } catch (err) {
    logger.error('document_extraction_failed', {
      documentId: doc.id,
      kind: err?.kind,
      reason: err?.message,
    });
    await markFailed(db, userId, doc, err, logger).catch((e) =>
      logger.error('document_fail_handling_failed', { reason: e?.message }),
    );
    return { status: 'failed' };
  }
}
