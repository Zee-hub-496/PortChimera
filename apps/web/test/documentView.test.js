import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_UPLOAD_BYTES,
  STATUS_LABELS,
  STATUS_TONES,
  buildReviewPayload,
  canProcess,
  canReview,
  confidencePercent,
  describeError,
  evidenceLabel,
  fieldRows,
  initialEdits,
  lineTable,
  precheckFile,
  shouldPoll,
  shownPayload,
} from '../src/lib/documentView.js';
import { buildUploadHeaders } from '../src/lib/apiCore.js';

const payload = {
  schema_version: 1,
  fields: {
    invoice_number: {
      value: 'INV-1',
      confidence: 0.9,
      status: 'extracted',
      evidence: 'Invoice No: INV-1',
      evidence_verified: true,
    },
    total_value: {
      value: 1200,
      confidence: 0.8,
      status: 'uncertain',
      evidence: 'Total 1200',
      evidence_verified: false,
    },
    incoterm: { value: null, confidence: 0, status: 'missing', evidence: null },
    currency: {
      value: 'USD',
      confidence: 0.7,
      status: 'extracted',
      evidence: 'USD',
      evidence_verified: null,
    },
  },
  lines: [
    {
      description: { value: 'Widget', confidence: 0.9, status: 'extracted', evidence: 'Widget' },
      quantity: { value: 5, confidence: 0.9, status: 'extracted', evidence: '5' },
    },
  ],
};

describe('precheckFile', () => {
  it('accepts a small pdf', () => {
    assert.equal(precheckFile({ size: 100, type: 'application/pdf' }), null);
  });
  it('rejects no file, empty, oversize and wrong type', () => {
    assert.ok(precheckFile(null));
    assert.match(precheckFile({ size: 0, type: 'application/pdf' }), /empty/);
    assert.match(precheckFile({ size: MAX_UPLOAD_BYTES + 1, type: 'application/pdf' }), /5 MB/);
    assert.match(precheckFile({ size: 5, type: 'application/zip' }), /PDF, JPEG and PNG/);
  });
});

describe('status rules', () => {
  it('polls only while processing', () => {
    assert.equal(shouldPoll('processing'), true);
    for (const s of ['uploaded', 'extracted', 'reviewed', 'failed']) {
      assert.equal(shouldPoll(s), false);
    }
  });
  it('allows process and review in the right states', () => {
    assert.equal(canProcess('uploaded'), true);
    assert.equal(canProcess('failed'), true);
    assert.equal(canProcess('reviewed'), false);
    assert.equal(canReview('extracted'), true);
    assert.equal(canReview('uploaded'), false);
  });
});

describe('evidenceLabel', () => {
  it('names each verification state', () => {
    assert.equal(evidenceLabel(payload.fields.invoice_number), 'Found in the document');
    assert.match(evidenceLabel(payload.fields.total_value), /Evidence not found/);
    assert.match(evidenceLabel(payload.fields.currency), /Not verifiable/);
    assert.match(evidenceLabel(payload.fields.incoterm), /Not found in the document/);
  });
});

describe('fieldRows', () => {
  const rows = fieldRows(payload);
  it('shows value, percent, label and evidence', () => {
    assert.equal(rows[0].label, 'Invoice number');
    assert.equal(rows[0].text, 'INV-1');
    assert.equal(rows[0].confidence, 90);
    assert.equal(rows[0].evidence, 'Invoice No: INV-1');
    assert.equal(rows[0].needsAttention, false);
  });
  it('flags uncertain, unverified-false and missing fields', () => {
    assert.equal(rows[1].needsAttention, true);
    assert.equal(rows[2].text, '');
    assert.equal(rows[2].needsAttention, true);
  });
  it('handles an empty payload', () => {
    assert.deepEqual(fieldRows(null), []);
  });
});

describe('confidencePercent', () => {
  it('rounds and clamps', () => {
    assert.equal(confidencePercent(0.876), 88);
    assert.equal(confidencePercent(2), 100);
    assert.equal(confidencePercent('x'), null);
  });
});

describe('lineTable', () => {
  it('builds columns and rows', () => {
    const t = lineTable(payload);
    assert.deepEqual(
      t.columns.map((c) => c.label),
      ['Description', 'Quantity'],
    );
    assert.deepEqual(t.rows, [['Widget', '5']]);
  });
});

describe('buildReviewPayload', () => {
  it('leaves untouched fields as they were, without evidence_verified', () => {
    const body = buildReviewPayload(payload, {});
    assert.equal(body.fields.invoice_number.value, 'INV-1');
    assert.equal('evidence_verified' in body.fields.invoice_number, false);
    assert.equal('schema_version' in body, false);
    assert.equal('evidence_verified' in body.lines[0].description, false);
  });
  it('marks an edited field extracted with full confidence', () => {
    const body = buildReviewPayload(payload, { invoice_number: ' INV-2 ' });
    assert.equal(body.fields.invoice_number.value, 'INV-2');
    assert.equal(body.fields.invoice_number.status, 'extracted');
    assert.equal(body.fields.invoice_number.confidence, 1);
  });
  it('keeps numbers numeric', () => {
    assert.equal(
      buildReviewPayload(payload, { total_value: '1300.5' }).fields.total_value.value,
      1300.5,
    );
    assert.equal(
      buildReviewPayload(payload, { total_value: 'n/a' }).fields.total_value.value,
      'n/a',
    );
  });
  it('turns an emptied field into missing with a null value', () => {
    const f = buildReviewPayload(payload, { invoice_number: '  ' }).fields.invoice_number;
    assert.equal(f.value, null);
    assert.equal(f.status, 'missing');
  });
  it('fills a missing field', () => {
    const f = buildReviewPayload(payload, { incoterm: 'FOB' }).fields.incoterm;
    assert.equal(f.value, 'FOB');
    assert.equal(f.status, 'extracted');
  });
  it('does not mutate the input', () => {
    const copy = structuredClone(payload);
    buildReviewPayload(payload, { invoice_number: 'X' });
    assert.deepEqual(payload, copy);
  });
});

describe('initialEdits', () => {
  it('prefers the reviewed payload', () => {
    const detail = {
      extraction: { payload, reviewedPayload: { fields: { a: { value: 'Z' } } } },
    };
    assert.deepEqual(initialEdits(detail), { a: 'Z' });
    assert.equal(initialEdits({ extraction: { payload } }).invoice_number, 'INV-1');
    assert.deepEqual(initialEdits(null), {});
  });
});

describe('describeError', () => {
  it('maps known codes to plain messages', () => {
    assert.match(describeError({ code: 'AI_NOT_CONFIGURED' }), /GEMINI_API_KEY/);
    assert.match(describeError({ code: 'FILE_TOO_LARGE' }), /5 MB/);
    assert.match(describeError({ code: 'DOCUMENT_EXISTS' }), /already has/);
  });
  it('falls back to the error message', () => {
    assert.equal(describeError({ code: 'X', message: 'boom' }), 'boom');
    assert.equal(describeError(null), 'Something went wrong.');
  });
});

describe('buildUploadHeaders', () => {
  it('sets mime type, token and filename', () => {
    const h = buildUploadHeaders('tok', 'application/pdf', 'invoice.pdf');
    assert.equal(h['Content-Type'], 'application/pdf');
    assert.equal(h.Authorization, 'Bearer tok');
    assert.equal(h['X-Filename'], 'invoice.pdf');
  });
  it('replaces non-ASCII characters and omits missing token or name', () => {
    const h = buildUploadHeaders(undefined, 'image/png', 'faktura\u00e9.png');
    assert.equal(h['X-Filename'], 'faktura_.png');
    assert.equal('Authorization' in h, false);
    assert.equal('X-Filename' in buildUploadHeaders('t', 'image/png', ''), false);
  });
});

describe('shownPayload after approval', () => {
  const original = {
    schema_version: 1,
    fields: {
      invoice_number: { ...payload.fields.invoice_number },
      total_value: { ...payload.fields.total_value, evidence_verified: false },
      currency: {
        value: 'EUR',
        confidence: 0.8,
        status: 'extracted',
        evidence: 'EUR',
        evidence_verified: null,
      },
    },
  };
  const approve = (edits) => {
    const body = buildReviewPayload(original, edits);
    return { extraction: { payload: original, reviewedPayload: body } };
  };

  it('shows the real original evidence for unchanged fields', () => {
    const shown = shownPayload(approve({}));
    assert.equal(evidenceLabel(shown.fields.invoice_number), 'Found in the document');
    assert.match(evidenceLabel(shown.fields.total_value), /Evidence not found/);
    assert.match(evidenceLabel(shown.fields.currency), /Not verifiable/);
  });

  it('labels edited fields as edited by you, even when emptied', () => {
    const shown = shownPayload(approve({ invoice_number: 'INV-9', currency: '' }));
    assert.equal(evidenceLabel(shown.fields.invoice_number), 'Edited by you');
    assert.equal(evidenceLabel(shown.fields.currency), 'Edited by you');
    assert.equal(fieldRows(shown).find((r) => r.key === 'invoice_number').needsAttention, false);
  });

  it('restores evidence_verified on unchanged line cells only', () => {
    const withLines = {
      ...original,
      lines: [
        {
          description: {
            value: 'Widget',
            status: 'extracted',
            evidence: 'W',
            evidence_verified: true,
          },
          quantity: { value: 5, status: 'extracted', evidence: '5', evidence_verified: false },
        },
      ],
    };
    const reviewed = {
      lines: [
        {
          description: { value: 'Widget', status: 'extracted', evidence: 'W' },
          quantity: { value: 6, status: 'extracted', evidence: '5' },
        },
      ],
    };
    const shown = shownPayload({ extraction: { payload: withLines, reviewedPayload: reviewed } });
    assert.equal(shown.lines[0].description.evidence_verified, true);
    assert.equal(shown.lines[0].quantity.evidence_verified, undefined);
  });

  it('ignores evidence_verified forged inside the reviewed payload', () => {
    const detail = approve({});
    detail.extraction.reviewedPayload.fields.total_value.evidence_verified = true;
    assert.match(evidenceLabel(shownPayload(detail).fields.total_value), /Evidence not found/);
  });

  it('does not send the display-only edited marker back to the server', () => {
    const shown = shownPayload(approve({ invoice_number: 'INV-9' }));
    const body = buildReviewPayload(shown, {});
    assert.equal('edited' in body.fields.invoice_number, false);
    assert.equal('evidence_verified' in body.fields.total_value, false);
  });

  it('shows the AI payload before any review', () => {
    assert.equal(shownPayload({ extraction: { payload: original } }), original);
    assert.equal(shownPayload(null), null);
  });
});

describe('STATUS_TONES', () => {
  it('has a tone for every document status', () => {
    for (const status of Object.keys(STATUS_LABELS)) assert.ok(STATUS_TONES[status], status);
  });
});
