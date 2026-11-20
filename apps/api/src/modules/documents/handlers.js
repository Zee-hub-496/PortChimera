import { AppError } from '../../middleware/errorHandler.js';
import { runJob as defaultRunJob } from './processJob.js';
import {
  BUCKET,
  createDownloadUrl,
  getDocumentDetail,
  listDocuments,
  markProcessing,
  saveReview,
  uploadDocument,
} from './service.js';

/** Removes fields the server computes, so a review body can be checked by the strict schema. */
export function stripComputed(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const { schema_version: _v, document_type: _t, ...rest } = body;
  const clean = (f) => {
    if (!f || typeof f !== 'object' || Array.isArray(f)) return f;
    const { evidence_verified: _e, ...keep } = f;
    return keep;
  };
  const out = { ...rest };
  if (rest.fields && typeof rest.fields === 'object') {
    out.fields = Object.fromEntries(Object.entries(rest.fields).map(([k, f]) => [k, clean(f)]));
  }
  if (Array.isArray(rest.lines)) {
    out.lines = rest.lines.map((line) =>
      line && typeof line === 'object'
        ? Object.fromEntries(Object.entries(line).map(([k, f]) => [k, clean(f)]))
        : line,
    );
  }
  return out;
}

/**
 * Handlers for the document endpoints. Everything that needs zod or the real AI provider is
 * injected, so tests can run these without Express, zod or the network.
 *
 * @param {object} deps
 * @param {Function} deps.parseId (value) => uuid string, throws AppError
 * @param {Function} deps.parseType (value) => document type, throws AppError
 * @param {Function} deps.parseReview (documentType, body) => validated payload, throws AppError
 * @param {Function} deps.parseExtraction (documentType, raw) => payload, throws AiError
 * @param {Function} deps.getProvider () => provider or null when AI is not configured
 * @param {Function} [deps.runJob] background job (replaceable in tests)
 * @param {object} [deps.logger]
 */
export function documentHandlers({
  parseId,
  parseType,
  parseReview,
  parseExtraction,
  getProvider,
  runJob = defaultRunJob,
  logger = console,
}) {
  // Documents with a job running in this process. A document that says "processing" but is not
  // in here (the API restarted mid-job) can be processed again.
  const activeJobs = new Set();

  return {
    async upload(req, res) {
      const shipmentId = parseId(req.params.shipmentId);
      const documentType = parseType(req.query?.type);
      if (!Buffer.isBuffer(req.body)) {
        throw new AppError(
          415,
          'UNSUPPORTED_MEDIA_TYPE',
          'Send the file as the request body with Content-Type application/pdf, image/jpeg or image/png',
        );
      }
      const doc = await uploadDocument(
        req.db,
        req.auth.userId,
        { shipmentId, documentType, buffer: req.body, filename: req.get('x-filename') },
        logger,
      );
      res.status(201).json({ data: doc });
    },
    async list(req, res) {
      const shipmentId = parseId(req.params.shipmentId);
      res.json({ data: await listDocuments(req.db, req.auth.userId, shipmentId) });
    },
    async get(req, res) {
      const id = parseId(req.params.id);
      res.json({ data: await getDocumentDetail(req.db, req.auth.userId, id) });
    },
    async download(req, res) {
      const id = parseId(req.params.id);
      res.json({ data: await createDownloadUrl(req.db, req.auth.userId, id) });
    },
    async process(req, res) {
      const id = parseId(req.params.id);
      const provider = getProvider();
      if (!provider) {
        throw new AppError(
          503,
          'AI_NOT_CONFIGURED',
          'AI extraction is not set up on this server. Ask the administrator to set GEMINI_API_KEY and GEMINI_MODEL.',
        );
      }
      // Reserve before any await so two overlapping requests cannot both start a job.
      if (activeJobs.has(id)) {
        throw new AppError(409, 'DOCUMENT_BUSY', 'This document is already being processed');
      }
      activeJobs.add(id);
      let doc;
      try {
        doc = await markProcessing(req.db, req.auth.userId, id);
      } catch (err) {
        activeJobs.delete(id);
        throw err;
      }
      // Fire and forget: the job never throws, and the catch is a last safety net.
      Promise.resolve(
        runJob({
          db: req.db,
          userId: req.auth.userId,
          doc,
          provider,
          parse: parseExtraction,
          logger,
          storage: req.db.storage.from(BUCKET),
        }),
      )
        .catch((err) => logger.error('document_job_crashed', { reason: err?.message }))
        .finally(() => activeJobs.delete(id));
      res.status(202).json({ data: { id: doc.id, processingStatus: 'processing' } });
    },
    async review(req, res) {
      const id = parseId(req.params.id);
      const current = await getDocumentDetail(req.db, req.auth.userId, id);
      const payload = parseReview(current.documentType, stripComputed(req.body));
      res.json({ data: await saveReview(req.db, req.auth.userId, id, payload, logger) });
    },
  };
}
