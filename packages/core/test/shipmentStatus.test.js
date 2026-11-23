import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_DOCUMENT_TYPES, deriveShipmentStatus } from '../src/index.js';

const T0 = '2026-11-23T10:00:00.000Z';
const T1 = '2026-11-23T11:00:00.000Z';
const T2 = '2026-11-23T12:00:00.000Z';

const doc = (documentType, processingStatus, reviewedAt = null) => ({
  documentType,
  processingStatus,
  reviewedAt,
});
const allReviewed = (reviewedAt = T0) =>
  REQUIRED_DOCUMENT_TYPES.map((t) => doc(t, 'reviewed', reviewedAt));
const finding = (reviewStatus) => ({ reviewStatus });
const derive = (documents, discrepancies = [], crossCheckedAt = null) =>
  deriveShipmentStatus({ documents, discrepancies, crossCheckedAt });

describe('deriveShipmentStatus: early states', () => {
  it('a new shipment with no documents is submitted', () => {
    assert.equal(derive([]), 'submitted');
  });

  it('uploaded documents that were not started stay submitted', () => {
    assert.equal(derive([doc('commercial_invoice', 'uploaded')]), 'submitted');
  });

  it('a failed extraction keeps the shipment submitted', () => {
    assert.equal(derive([doc('commercial_invoice', 'failed')]), 'submitted');
  });

  it('any document being processed means ai_processing', () => {
    assert.equal(
      derive([doc('commercial_invoice', 'processing'), doc('packing_list', 'uploaded')]),
      'ai_processing',
    );
  });

  it('processing wins over an extracted document', () => {
    assert.equal(
      derive([doc('commercial_invoice', 'processing'), doc('packing_list', 'extracted')]),
      'ai_processing',
    );
  });

  it('an extracted document waiting for approval means requires_review', () => {
    assert.equal(derive([doc('commercial_invoice', 'extracted')]), 'requires_review');
  });

  it('some reviewed documents but not all required types stays submitted', () => {
    assert.equal(
      derive([doc('commercial_invoice', 'reviewed', T0), doc('packing_list', 'reviewed', T0)]),
      'submitted',
    );
  });
});

describe('deriveShipmentStatus: after all documents are approved', () => {
  it('requires review until a cross-check has run', () => {
    assert.equal(derive(allReviewed(), [], null), 'requires_review');
  });

  it('an open discrepancy means requires_review', () => {
    assert.equal(derive(allReviewed(T0), [finding('open')], T1), 'requires_review');
  });

  it('a cross-check with no findings is ai_pre_cleared', () => {
    assert.equal(derive(allReviewed(T0), [], T1), 'ai_pre_cleared');
  });

  it('all discrepancies resolved leads to ai_pre_cleared', () => {
    const found = [finding('accepted'), finding('resolved'), finding('dismissed')];
    assert.equal(derive(allReviewed(T0), found, T1), 'ai_pre_cleared');
  });

  it('one open discrepancy among decided ones still requires review', () => {
    const found = [finding('accepted'), finding('open')];
    assert.equal(derive(allReviewed(T0), found, T1), 'requires_review');
  });

  it('reopening a decided discrepancy moves the shipment back to requires_review', () => {
    assert.equal(derive(allReviewed(T0), [finding('resolved')], T1), 'ai_pre_cleared');
    assert.equal(derive(allReviewed(T0), [finding('open')], T1), 'requires_review');
  });
});

describe('deriveShipmentStatus: approval revoked or changed', () => {
  it('an approval saved after the cross-check makes the check stale', () => {
    const docs = allReviewed(T0);
    docs[0].reviewedAt = T2;
    assert.equal(derive(docs, [], T1), 'requires_review');
  });

  it('a review saved at the same moment as the cross-check is not stale', () => {
    assert.equal(derive(allReviewed(T1), [], T1), 'ai_pre_cleared');
  });

  it('a revoked approval (document back to extracted) leaves ai_pre_cleared', () => {
    assert.equal(derive(allReviewed(T0), [], T1), 'ai_pre_cleared');
    const docs = allReviewed(T0);
    docs[1].processingStatus = 'extracted';
    assert.equal(derive(docs, [], T1), 'requires_review');
  });

  it('a revoked approval where the document was removed goes back to submitted', () => {
    const docs = allReviewed(T0).slice(0, 2);
    assert.equal(derive(docs, [], T1), 'submitted');
  });

  it('a re-run extraction after approval means ai_processing again', () => {
    const docs = allReviewed(T0);
    docs[2].processingStatus = 'processing';
    assert.equal(derive(docs, [], T1), 'ai_processing');
  });
});

describe('deriveShipmentStatus: never claims clearance and validates input', () => {
  it('never returns cleared', () => {
    assert.notEqual(derive(allReviewed(T0), [], T1), 'cleared');
  });

  it('rejects unknown document statuses', () => {
    assert.throws(() => derive([doc('commercial_invoice', 'done')]), TypeError);
  });

  it('rejects unknown discrepancy statuses', () => {
    assert.throws(() => derive([], [finding('maybe')]), TypeError);
  });

  it('rejects non-array input', () => {
    assert.throws(() => deriveShipmentStatus({ documents: null, discrepancies: [] }), TypeError);
  });

  it('does not change its inputs', () => {
    const docs = allReviewed(T0);
    const found = [finding('open')];
    const before = JSON.stringify([docs, found]);
    derive(docs, found, T1);
    assert.equal(JSON.stringify([docs, found]), before);
  });
});
