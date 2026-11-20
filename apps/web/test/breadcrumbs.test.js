import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildBreadcrumbs } from '../src/lib/breadcrumbs.js';

describe('buildBreadcrumbs', () => {
  it('labels top-level pages', () => {
    assert.deepEqual(buildBreadcrumbs('/dashboard'), [{ label: 'Dashboard' }]);
    assert.deepEqual(buildBreadcrumbs('/map'), [{ label: 'Global Map' }]);
  });

  it('links the parents of a shipment page and resolves the number', () => {
    assert.deepEqual(buildBreadcrumbs('/shipments/abc/documents', { abc: 'SHP-003' }), [
      { label: 'Shipments', to: '/shipments' },
      { label: 'SHP-003', to: '/shipments/abc' },
      { label: 'Documents' },
    ]);
  });

  it('falls back to "Shipment" when the number is unknown', () => {
    assert.deepEqual(buildBreadcrumbs('/shipments/xyz'), [
      { label: 'Shipments', to: '/shipments' },
      { label: 'Shipment' },
    ]);
  });

  it('labels cross-check and route tabs', () => {
    assert.equal(buildBreadcrumbs('/shipments/1/cross-check').at(-1).label, 'Cross-check');
    assert.equal(buildBreadcrumbs('/shipments/1/route').at(-1).label, 'Route');
  });

  it('handles the list page and empty paths', () => {
    assert.deepEqual(buildBreadcrumbs('/shipments'), [{ label: 'Shipments' }]);
    assert.deepEqual(buildBreadcrumbs(''), [{ label: 'Home' }]);
  });
});
