import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crossCheck } from '../../../../packages/core/src/index.js';
import { mapReviewedPayloads } from '../../src/modules/crosscheck/mapPayloads.js';
import { planRerun, findingToRow } from '../../src/modules/crosscheck/discrepancyView.js';
import { demoRows } from '../helpers/crosscheckPayloads.js';

describe('mapReviewedPayloads', () => {
  it('turns the consistent demo set into zero findings', () => {
    const { findings, summary } = crossCheck(mapReviewedPayloads(demoRows()));
    assert.deepEqual(findings, []);
    assert.equal(summary.overall, 'consistent');
  });

  it('finds exactly one high gross weight finding, 500 kg vs 650 kg', () => {
    const { findings, summary } = crossCheck(
      mapReviewedPayloads(demoRows({ packingGross: '650 kg' })),
    );
    assert.equal(findings.length, 1);
    const [f] = findings;
    assert.equal(f.field, 'grossWeight');
    assert.equal(f.severity, 'high');
    assert.deepEqual(f.values, { commercial_invoice: '500 kg', packing_list: '650 kg' });
    assert.equal(f.difference.absolute, 150);
    assert.equal(summary.overall, 'high');
  });

  it('ignores documents that are not reviewed', () => {
    const rows = demoRows().map((r) =>
      r.document_type === 'certificate_of_origin' ? { ...r, reviewed_payload: null } : r,
    );
    assert.deepEqual(Object.keys(mapReviewedPayloads(rows)).sort(), [
      'commercial_invoice',
      'packing_list',
    ]);
  });

  it('refuses with 409 when fewer than two documents are reviewed', () => {
    const one = demoRows().map((r, i) => (i === 0 ? r : { ...r, reviewed_payload: null }));
    for (const rows of [[], one]) {
      assert.throws(
        () => mapReviewedPayloads(rows),
        (e) =>
          e.status === 409 &&
          e.code === 'NOT_ENOUGH_REVIEWED_DOCUMENTS' &&
          /two documents/.test(e.message),
      );
    }
  });

  it('treats missing and blank fields as not provided, never zero', () => {
    const rows = demoRows();
    const inv = rows[0].reviewed_payload;
    inv.fields.total_value = { value: null, confidence: 0, status: 'missing', evidence: null };
    inv.fields.currency = { value: '  ', confidence: 0.5, status: 'uncertain', evidence: null };
    const doc = mapReviewedPayloads(rows).commercial_invoice;
    assert.equal('totalValue' in doc, false);
    assert.equal('currency' in doc, false);
  });
});

describe('planRerun', () => {
  const finding = (extra = {}) => ({
    shipment_id: 's1',
    ...findingToRow({
      key: 'grossWeight|commercial_invoice+packing_list',
      category: 'weight',
      field: 'grossWeight',
      severity: 'high',
      values: { commercial_invoice: '500 kg', packing_list: '650 kg' },
      difference: { absolute: 150 },
      explanation: 'x',
      recommendedAction: 'y',
      ...extra,
    }),
  });

  it('inserts new findings', () => {
    assert.equal(planRerun([], [finding()]).insert.length, 1);
  });

  it('updates open rows only when something changed', () => {
    const stored = [{ id: 'a', review_status: 'open', ...finding() }];
    assert.deepEqual(planRerun(stored, [finding()]), { insert: [], update: [], remove: [] });
    const plan = planRerun(stored, [
      finding({ values: { commercial_invoice: '500 kg', packing_list: '700 kg' } }),
    ]);
    assert.equal(plan.update.length, 1);
  });

  it('leaves decided rows alone, even when the values changed', () => {
    const stored = [{ id: 'a', review_status: 'dismissed', ...finding() }];
    const plan = planRerun(stored, [finding({ severity: 'medium' })]);
    assert.deepEqual(plan, { insert: [], update: [], remove: [] });
  });

  it('removes open rows that no longer appear and keeps decided ones', () => {
    const stored = [
      { id: 'a', review_status: 'open', ...finding() },
      { id: 'b', review_status: 'accepted', ...finding(), finding_key: 'other' },
    ];
    assert.deepEqual(planRerun(stored, []).remove, ['a']);
  });
});
