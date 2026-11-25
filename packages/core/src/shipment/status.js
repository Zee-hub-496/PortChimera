// Shipment status derivation. Pure: no database, network or framework code.
// The status is a summary of what the documents and discrepancies say right now. It is never
// set by hand. 'cleared' is not derived: only a person could grant it, and nothing does today.

/** The document types every shipment needs before it can be pre-cleared. */
export const REQUIRED_DOCUMENT_TYPES = Object.freeze([
  'commercial_invoice',
  'packing_list',
  'certificate_of_origin',
]);

const PROCESSING_STATUSES = Object.freeze([
  'uploaded',
  'processing',
  'extracted',
  'failed',
  'reviewed',
]);
const REVIEW_STATUSES = Object.freeze(['open', 'accepted', 'resolved', 'dismissed']);

const toTime = (iso) => {
  const t = typeof iso === 'string' ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? null : t;
};

function checkInput({ documents, discrepancies }) {
  if (!Array.isArray(documents) || !Array.isArray(discrepancies)) {
    throw new TypeError('documents and discrepancies must be arrays');
  }
  for (const d of documents) {
    if (!PROCESSING_STATUSES.includes(d?.processingStatus)) {
      throw new TypeError(`Unknown document processing status: ${d?.processingStatus}`);
    }
  }
  for (const f of discrepancies) {
    if (!REVIEW_STATUSES.includes(f?.reviewStatus)) {
      throw new TypeError(`Unknown discrepancy review status: ${f?.reviewStatus}`);
    }
  }
}

/**
 * Returns the status a shipment should have, from its documents and cross-check findings.
 *
 * Rules, first match wins:
 * 1. Any document is being read by the AI                      -> 'ai_processing'
 * 2. Any document is extracted and waiting for a person's review -> 'requires_review'
 * 3. Not every required document type has a reviewed document   -> 'submitted'
 *    (nothing uploaded, or uploaded/failed documents that still need action)
 * 4. All reviewed, but the cross-check never ran or is older than
 *    the newest approval                                         -> 'requires_review'
 * 5. The cross-check has an open discrepancy                    -> 'requires_review'
 * 6. Otherwise (no findings, or every finding was decided)      -> 'ai_pre_cleared'
 *
 * 'ai_pre_cleared' is an internal label. It never means customs clearance.
 *
 * @param {object} input
 * @param {Array<{documentType: string, processingStatus: string, reviewedAt?: string|null}>} input.documents
 * @param {Array<{reviewStatus: string}>} input.discrepancies
 * @param {string|null} [input.crossCheckedAt] ISO time of the latest cross-check, or null
 * @returns {'submitted'|'ai_processing'|'requires_review'|'ai_pre_cleared'}
 */
export function deriveShipmentStatus({ documents, discrepancies, crossCheckedAt = null }) {
  checkInput({ documents, discrepancies });

  if (documents.some((d) => d.processingStatus === 'processing')) return 'ai_processing';
  if (documents.some((d) => d.processingStatus === 'extracted')) return 'requires_review';

  const reviewed = documents.filter((d) => d.processingStatus === 'reviewed');
  const haveAll = REQUIRED_DOCUMENT_TYPES.every((type) =>
    reviewed.some((d) => d.documentType === type),
  );
  if (!haveAll) return 'submitted';

  const checkedAt = toTime(crossCheckedAt);
  if (checkedAt === null) return 'requires_review';
  // A review saved after the last cross-check means the check is out of date.
  if (reviewed.some((d) => (toTime(d.reviewedAt) ?? 0) > checkedAt)) return 'requires_review';

  if (discrepancies.some((f) => f.reviewStatus === 'open')) return 'requires_review';
  return 'ai_pre_cleared';
}

/**
 * Is the stored cross-check out of date? True when a review was saved after the check ran, or
 * when the set of approved documents is no longer the set the check compared (one approval was
 * taken back, or a new document was approved). False before any check ran: that is "not run".
 *
 * @param {object} input
 * @param {Array<{documentType: string, processingStatus: string, reviewedAt?: string|null}>} input.documents
 * @param {string|null} input.crossCheckedAt ISO time of the latest cross-check, or null
 * @param {string[]|null} [input.comparedTypes] document types the check compared; null skips that test
 */
export function isCrossCheckStale({ documents, crossCheckedAt, comparedTypes = null }) {
  const checkedAt = toTime(crossCheckedAt);
  if (checkedAt === null || !Array.isArray(documents)) return false;
  const reviewed = documents.filter((d) => d?.processingStatus === 'reviewed');
  if (reviewed.some((d) => (toTime(d.reviewedAt) ?? 0) > checkedAt)) return true;
  if (Array.isArray(comparedTypes)) {
    const now = new Set(reviewed.map((d) => d.documentType));
    if (comparedTypes.some((t) => !now.has(t))) return true;
    if ([...now].some((t) => !comparedTypes.includes(t))) return true;
  }
  return false;
}
