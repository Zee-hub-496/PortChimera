import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateShipmentForm } from '../src/lib/shipmentForm.js';

const ok = {
  shipmentNumber: ' SHP-1 ',
  originPortCode: 'CNSHA',
  destinationPortCode: 'PKKHI',
  incoterm: '',
};

describe('validateShipmentForm', () => {
  it('accepts a valid form, trims, and leaves out an empty incoterm', () => {
    const r = validateShipmentForm(ok);
    assert.equal(r.valid, true);
    assert.deepEqual(r.value, {
      shipmentNumber: 'SHP-1',
      originPortCode: 'CNSHA',
      destinationPortCode: 'PKKHI',
    });
  });
  it('keeps a valid incoterm', () => {
    assert.equal(validateShipmentForm({ ...ok, incoterm: 'FOB' }).value.incoterm, 'FOB');
  });
  it('requires the shipment number', () => {
    const r = validateShipmentForm({ ...ok, shipmentNumber: '   ' });
    assert.equal(r.valid, false);
    assert.ok(r.errors.shipmentNumber);
  });
  it('requires both ports', () => {
    const r = validateShipmentForm({ ...ok, originPortCode: '', destinationPortCode: '' });
    assert.ok(r.errors.originPortCode && r.errors.destinationPortCode);
  });
  it('rejects the same origin and destination', () => {
    const r = validateShipmentForm({ ...ok, destinationPortCode: 'CNSHA' });
    assert.match(r.errors.destinationPortCode, /different/);
  });
  it('rejects an unknown incoterm', () => {
    assert.ok(validateShipmentForm({ ...ok, incoterm: 'XYZ' }).errors.incoterm);
  });
  it('handles missing input', () => {
    assert.equal(validateShipmentForm(undefined).valid, false);
  });
});
