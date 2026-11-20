import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  searchItems,
  buildShipmentItems,
  buildPortItems,
  PAGE_ITEMS,
  filterShipments,
} from '../src/lib/search.js';

const shipments = [
  {
    id: 'a',
    shipmentNumber: 'SHP-003',
    origin: { name: 'Shanghai' },
    destination: { name: 'Karachi' },
    status: 'submitted',
  },
  {
    id: 'b',
    shipmentNumber: 'KAR-1',
    origin: { name: 'Busan' },
    destination: { name: 'Rotterdam' },
    status: 'cleared',
  },
];

describe('searchItems', () => {
  const items = buildShipmentItems(shipments);
  it('returns everything for an empty query', () =>
    assert.equal(searchItems(items, '  ').length, 2));
  it('ranks prefix before substring before hint', () => {
    const r = searchItems(items, 'kar');
    assert.deepEqual(
      r.map((i) => i.label),
      ['KAR-1', 'SHP-003'],
    );
  });
  it('matches keywords such as status', () => {
    assert.deepEqual(
      searchItems(items, 'cleared').map((i) => i.label),
      ['KAR-1'],
    );
  });
  it('returns nothing for no match and respects limit', () => {
    assert.equal(searchItems(items, 'zzz').length, 0);
    assert.equal(searchItems(items, '', 1).length, 1);
  });
});

describe('builders', () => {
  it('builds shipment items linking to the shipment', () => {
    const [i] = buildShipmentItems(shipments);
    assert.equal(i.to, '/shipments/a');
    assert.equal(i.hint, 'Shanghai to Karachi');
  });
  it('builds port items with code and country', () => {
    const [p] = buildPortItems([{ code: 'PKKHI', name: 'Karachi', country: 'PK' }]);
    assert.equal(p.label, 'Karachi');
    assert.ok(p.hint.includes('PKKHI') && p.hint.includes('PK'));
    assert.equal(p.to, '/map?port=PKKHI');
    assert.equal(buildPortItems([{ code: 'X', name: 'Y' }])[0].hint, 'X');
  });
  it('limits signed-out pages to public routes', () => {
    const out = PAGE_ITEMS(false).map((p) => p.to);
    assert.ok(out.includes('/login') && !out.includes('/dashboard'));
    assert.ok(PAGE_ITEMS(true).some((p) => p.to === '/dashboard'));
  });
  it('filters shipments', () => {
    assert.deepEqual(
      filterShipments(shipments, 'rotter').map((s) => s.id),
      ['b'],
    );
    assert.equal(filterShipments(shipments, '').length, 2);
  });
});
