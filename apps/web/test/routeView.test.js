import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatDays, formatRoute, formatUsd, ILLUSTRATIVE_NOTICE } from '../src/lib/routeView.js';

const found = {
  shipmentId: 's1',
  objective: 'lowest_risk',
  status: 'found',
  dataLabel: 'illustrative',
  path: [
    { code: 'CNSHA', name: 'Shanghai' },
    { code: 'PKKHI', name: 'Karachi' },
  ],
  totals: { transitDays: 18, freightCostUsd: 1850, riskSum: 3.25, riskMax: 2 },
};

describe('formatRoute', () => {
  it('formats a found route and carries the illustrative label', () => {
    const r = formatRoute(found);
    assert.equal(r.found, true);
    assert.equal(r.objective, 'Lowest risk');
    assert.equal(r.days, '18 days');
    assert.equal(r.cost, '$1,850');
    assert.equal(r.risk, '3.3 total, 2.0 worst leg');
    assert.deepEqual(r.stops, ['Shanghai (CNSHA)', 'Karachi (PKKHI)']);
    assert.equal(r.pathLabel, 'Shanghai > Karachi');
    assert.equal(r.notice, ILLUSTRATIVE_NOTICE);
  });
  it('reports no_route with the reason and no stops', () => {
    const r = formatRoute({
      status: 'no_route',
      objective: 'fastest',
      reason: 'Ports not connected',
      path: [],
      totals: null,
      dataLabel: 'illustrative',
    });
    assert.equal(r.found, false);
    assert.equal(r.message, 'Ports not connected');
    assert.deepEqual(r.stops, []);
  });
  it('shows no notice when data is not labelled illustrative', () => {
    assert.equal(formatRoute({ ...found, dataLabel: 'verified' }).notice, '');
  });
});

describe('formatDays and formatUsd', () => {
  it('uses singular for one day and one decimal for fractions', () => {
    assert.equal(formatDays(1), '1 day');
    assert.equal(formatDays(2.5), '2.5 days');
  });
  it('formats dollars', () => {
    assert.equal(formatUsd(1234567), '$1,234,567');
  });
});
