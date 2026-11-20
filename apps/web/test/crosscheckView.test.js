import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DECISIONS,
  DISCLAIMER,
  OVERALL_LABELS,
  REVIEW_TONES,
  SEVERITY_CLASSES,
  SEVERITY_LABELS,
  SEVERITY_TONES,
  STATUS_LABELS,
  canDecide,
  countOpen,
  describeCrossCheckError,
  differenceText,
  sortFindings,
  summaryView,
  valueRows,
} from '../src/lib/crosscheckView.js';

const weight = {
  id: 'a',
  field: 'grossWeight',
  severity: 'high',
  reviewStatus: 'open',
  values: { commercial_invoice: '500 kg', packing_list: '650 kg' },
  difference: { absolute: 150, percent: 23.077, unit: 'kg' },
};

describe('crosscheckView', () => {
  it('shows values side by side with readable document names', () => {
    assert.deepEqual(valueRows(weight), [
      { documentType: 'commercial_invoice', document: 'Commercial invoice', value: '500 kg' },
      { documentType: 'packing_list', document: 'Packing list', value: '650 kg' },
    ]);
    assert.equal(valueRows({ values: { packing_list: null } })[0].value, 'not provided');
  });

  it('describes the difference with the larger-value percent', () => {
    assert.equal(differenceText(weight.difference), '150 kg (23.1% of the larger value)');
    assert.equal(differenceText({ absolute: 10 }), '10');
    assert.equal(differenceText(null), '');
  });

  it('sorts by severity, then field, without changing the input', () => {
    const input = [
      { field: 'b', severity: 'low' },
      { field: 'z', severity: 'high' },
      { field: 'a', severity: 'high' },
      { field: 'm', severity: 'medium' },
    ];
    assert.deepEqual(
      sortFindings(input).map((f) => f.field),
      ['a', 'z', 'm', 'b'],
    );
    assert.equal(input[0].field, 'b');
  });

  it('only open items can be decided and counted', () => {
    const items = [weight, { ...weight, id: 'b', reviewStatus: 'dismissed' }];
    assert.equal(canDecide(items[0]), true);
    assert.equal(canDecide(items[1]), false);
    assert.deepEqual(countOpen(items), {
      total: 1,
      bySeverity: { critical: 0, high: 1, medium: 0, low: 0 },
    });
  });

  it('offers exactly accept, resolve and dismiss', () => {
    assert.deepEqual(
      DECISIONS.map((d) => d.value),
      ['accepted', 'resolved', 'dismissed'],
    );
  });

  it('builds the summary view', () => {
    assert.equal(summaryView(null, []), null);
    const v = summaryView(
      {
        overall: 'high',
        bySeverity: { critical: 0, high: 1, medium: 0, low: 0 },
        comparedFields: ['grossWeight'],
        notCompared: [{ field: 'currency', reason: 'only the commercial invoice provides it' }],
      },
      [weight],
    );
    assert.equal(v.openCount, 1);
    assert.deepEqual(v.comparedFields, ['Gross weight']);
    assert.deepEqual(v.notCompared, ['Currency: only the commercial invoice provides it']);
    assert.equal(v.severityCounts.find((s) => s.severity === 'high').count, 1);
    assert.match(v.overallLabel, /manual verification/);
  });

  it('explains the not-enough-documents error in plain words', () => {
    assert.match(
      describeCrossCheckError({ code: 'NOT_ENOUGH_REVIEWED_DOCUMENTS' }),
      /two documents/,
    );
    assert.equal(describeCrossCheckError({ message: 'boom' }), 'boom');
  });

  it('never uses accusing wording', () => {
    const all = [DISCLAIMER, ...Object.values(OVERALL_LABELS), ...DECISIONS.map((d) => d.hint)];
    for (const text of all) assert.doesNotMatch(text, /fraud|fraudulent|illegal|smuggl/i);
    assert.match(DISCLAIMER, /possible inconsistencies/);
    assert.match(DISCLAIMER, /manual verification/);
  });
});

describe('theme tokens', () => {
  it('uses theme tokens only, no hard-coded palette colours', () => {
    for (const cls of Object.values(SEVERITY_CLASSES)) {
      assert.doesNotMatch(cls, /\b(?:slate|red|amber|sky|green|emerald)-\d/);
    }
  });

  it('has a class and tone for every severity, and a tone for every review status', () => {
    for (const severity of Object.keys(SEVERITY_LABELS)) {
      assert.ok(SEVERITY_CLASSES[severity]);
      assert.ok(SEVERITY_TONES[severity]);
    }
    for (const status of Object.keys(STATUS_LABELS)) assert.ok(REVIEW_TONES[status]);
  });
});
