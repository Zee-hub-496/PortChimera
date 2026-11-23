import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeShipments, STATUS_LABELS, statusTone } from '../src/lib/overviewStats.js';

describe('overviewStats', () => {
  it('summarizes counts and distinct ports', () => {
    const r = summarizeShipments([
      { status: 'submitted', origin: { code: 'A' }, destination: { code: 'B' } },
      { status: 'requires_review', origin: { code: 'A' }, destination: { code: 'C' } },
      { status: 'weird', origin: null, destination: null },
    ]);
    assert.equal(r.total, 3);
    assert.equal(r.byStatus.submitted, 1);
    assert.equal(r.needsReview, 1);
    assert.equal(r.portCount, 3);
  });
  it('per-status counts equal a direct count and add up to the total', () => {
    const statuses = ['submitted', 'ai_processing', 'requires_review', 'ai_pre_cleared'];
    const list = [0, 1, 1, 2, 2, 2, 3].map((i) => ({ status: statuses[i] }));
    const r = summarizeShipments(list);
    for (const s of statuses)
      assert.equal(r.byStatus[s], list.filter((x) => x.status === s).length);
    assert.equal(
      Object.values(r.byStatus).reduce((a, b) => a + b, 0),
      r.total,
    );
  });
  it('handles empty input', () => {
    assert.equal(summarizeShipments(undefined).total, 0);
  });
  it('gives every status a label and a valid tone', () => {
    const tones = ['neutral', 'info', 'success', 'warn', 'danger'];
    for (const k of Object.keys(STATUS_LABELS)) assert.ok(tones.includes(statusTone(k)));
    assert.equal(statusTone('nope'), 'neutral');
  });
});
