// Needs zod installed (npm install). Not runnable in the sandbox without network access.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../src/middleware/errorHandler.js';
import {
  createShipmentSchema,
  makeParser,
  shipmentIdSchema,
} from '../src/modules/shipments/schemas.js';
import { calculateRouteSchema } from '../src/modules/routes/schemas.js';

const parseCreate = makeParser(createShipmentSchema, AppError);
const valid = { shipmentNumber: ' SHP-1 ', originPortCode: 'cnsha', destinationPortCode: 'PKKHI' };

describe('createShipmentSchema', () => {
  it('trims and upper-cases, and incoterm is optional', () => {
    assert.deepEqual(parseCreate(valid), {
      shipmentNumber: 'SHP-1',
      originPortCode: 'CNSHA',
      destinationPortCode: 'PKKHI',
    });
  });
  it('rejects unknown fields such as userId', () => {
    assert.throws(
      () => parseCreate({ ...valid, userId: 'x' }),
      (e) => e.status === 422,
    );
  });
  it('rejects a bad incoterm, bad port code and empty number', () => {
    assert.throws(() => parseCreate({ ...valid, incoterm: 'ABC' }));
    assert.throws(() => parseCreate({ ...valid, originPortCode: 'X' }));
    assert.throws(() => parseCreate({ ...valid, shipmentNumber: '  ' }));
  });
  it('accepts each valid incoterm', () => {
    assert.equal(parseCreate({ ...valid, incoterm: 'DDP' }).incoterm, 'DDP');
  });
});

describe('other schemas', () => {
  it('shipment id must be a uuid', () => {
    assert.equal(shipmentIdSchema.safeParse('nope').success, false);
    assert.equal(shipmentIdSchema.safeParse('3f2b8c1e-5d4a-4e6b-9c7d-1a2b3c4d5e6f').success, true);
  });
  it('route body is strict and validates objective', () => {
    const id = '3f2b8c1e-5d4a-4e6b-9c7d-1a2b3c4d5e6f';
    assert.equal(calculateRouteSchema.safeParse({ shipmentId: id }).success, true);
    assert.equal(calculateRouteSchema.safeParse({ shipmentId: id, objective: 'x' }).success, false);
    assert.equal(calculateRouteSchema.safeParse({ shipmentId: id, userId: 'u' }).success, false);
  });
});
