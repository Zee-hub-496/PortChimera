import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterAlerts, filterDocuments, paginate, rangeText } from '../src/lib/hubView.js';

const finding = (o) => ({
  id: o.id,
  shipmentNumber: 'SHP-1',
  field: 'grossWeight',
  documents: ['commercial_invoice', 'packing_list'],
  severity: 'medium',
  reviewStatus: 'open',
  createdAt: '2026-01-01T00:00:00Z',
  ...o,
});

describe('filterAlerts', () => {
  const items = [
    finding({ id: 'a', severity: 'low' }),
    finding({ id: 'b', severity: 'critical', createdAt: '2026-01-01T00:00:00Z' }),
    finding({ id: 'c', severity: 'critical', createdAt: '2026-02-01T00:00:00Z' }),
    finding({ id: 'd', severity: 'high', reviewStatus: 'resolved', shipmentNumber: 'XYZ-9' }),
  ];
  it('orders by severity, then newest first', () => {
    assert.deepEqual(
      filterAlerts(items).map((f) => f.id),
      ['c', 'b', 'd', 'a'],
    );
  });
  it('filters by severity and status', () => {
    assert.deepEqual(
      filterAlerts(items, { severity: 'critical' }).map((f) => f.id),
      ['c', 'b'],
    );
    assert.deepEqual(
      filterAlerts(items, { status: 'resolved' }).map((f) => f.id),
      ['d'],
    );
  });
  it('searches shipment number, field and document names, ignoring case', () => {
    assert.deepEqual(
      filterAlerts(items, { query: 'xyz' }).map((f) => f.id),
      ['d'],
    );
    assert.equal(filterAlerts(items, { query: 'packing list' }).length, 4);
    assert.equal(filterAlerts(items, { query: 'nothing here' }).length, 0);
  });
  it('does not change the input and handles null', () => {
    const copy = JSON.stringify(items);
    filterAlerts(items);
    assert.equal(JSON.stringify(items), copy);
    assert.deepEqual(filterAlerts(null), []);
  });
});

describe('filterDocuments', () => {
  const docs = [
    {
      id: 1,
      shipmentNumber: 'SHP-1',
      originalFilename: 'inv.pdf',
      documentType: 'commercial_invoice',
      processingStatus: 'reviewed',
    },
    {
      id: 2,
      shipmentNumber: 'SHP-2',
      originalFilename: 'pl.pdf',
      documentType: 'packing_list',
      processingStatus: 'failed',
    },
  ];
  it('filters by status, type and text', () => {
    assert.deepEqual(
      filterDocuments(docs, { status: 'failed' }).map((d) => d.id),
      [2],
    );
    assert.deepEqual(
      filterDocuments(docs, { type: 'commercial_invoice' }).map((d) => d.id),
      [1],
    );
    assert.deepEqual(
      filterDocuments(docs, { query: 'PL.PDF' }).map((d) => d.id),
      [2],
    );
    assert.deepEqual(
      filterDocuments(docs, { query: 'invoice' }).map((d) => d.id),
      [1],
    );
  });
});

describe('paginate', () => {
  const list = Array.from({ length: 25 }, (_, i) => i);
  it('slices pages and counts them', () => {
    const p = paginate(list, 2);
    assert.deepEqual(p.items, [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    assert.equal(p.pages, 3);
    assert.equal(paginate(list, 3).items.length, 5);
  });
  it('clamps bad page numbers and handles empty lists', () => {
    assert.equal(paginate(list, 99).page, 3);
    assert.equal(paginate(list, 0).page, 1);
    assert.equal(paginate(list, 'x').page, 1);
    const e = paginate([], 1);
    assert.deepEqual([e.page, e.pages, e.total], [1, 1, 0]);
  });
  it('describes the range', () => {
    assert.equal(rangeText(paginate(list, 3)), 'Showing 21 to 25 of 25');
    assert.equal(rangeText(paginate([], 1)), 'No results');
  });
});
