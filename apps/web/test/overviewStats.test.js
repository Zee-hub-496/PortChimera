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
  it('handles empty input', () => {
    assert.equal(summarizeShipments(undefined).total, 0);
  });
  it('gives every status a label and a valid tone', () => {
    const tones = ['neutral', 'info', 'success', 'warn', 'danger'];
    for (const k of Object.keys(STATUS_LABELS)) assert.ok(tones.includes(statusTone(k)));
    assert.equal(statusTone('nope'), 'neutral');
  });
});
