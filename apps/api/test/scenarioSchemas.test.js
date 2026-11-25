// Needs zod installed (npm install). Not runnable in the sandbox without network access.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../src/middleware/errorHandler.js';
import { makeParser } from '../src/modules/shipments/schemas.js';
import {
  createScenarioSchema,
  effectSchema,
  idSchema,
  simulateSchema,
  updateScenarioSchema,
} from '../src/modules/scenarios/schemas.js';
import { scenariosRouter } from '../src/modules/scenarios/routes.js';

const UUID = '3f2b8c1e-9d4a-4e6b-8a7c-1d2e3f4a5b6c';
const UUID2 = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const parse = (schema) => makeParser(schema, AppError);
const code = (fn) => {
  try {
    fn();
  } catch (e) {
    return e.code;
  }
  return null;
};

describe('scenario schemas', () => {
  it('accepts a port effect and a lane effect', () => {
    assert.deepEqual(parse(effectSchema)({ type: 'port_strike', portId: UUID }), {
      type: 'port_strike',
      portId: UUID,
    });
    assert.ok(parse(effectSchema)({ type: 'connection_failure', edgeId: UUID, note: ' storm ' }));
  });

  it('needs exactly one of portId and edgeId', () => {
    const p = parse(effectSchema);
    assert.equal(
      code(() => p({ type: 'port_strike' })),
      'VALIDATION_ERROR',
    );
    assert.equal(
      code(() => p({ type: 'port_strike', portId: UUID, edgeId: UUID2 })),
      'VALIDATION_ERROR',
    );
  });

  it('rejects unknown effect types, bad ids and extra fields', () => {
    const p = parse(effectSchema);
    assert.equal(
      code(() => p({ type: 'flood', portId: UUID })),
      'VALIDATION_ERROR',
    );
    assert.equal(
      code(() => p({ type: 'port_strike', portId: 'nope' })),
      'VALIDATION_ERROR',
    );
    assert.equal(
      code(() => p({ type: 'port_strike', portId: UUID, userId: UUID2 })),
      'VALIDATION_ERROR',
    );
  });

  it('create: trims the name, makes effects optional and rejects a user id', () => {
    const p = parse(createScenarioSchema);
    assert.deepEqual(p({ name: '  Strike  ' }), { name: 'Strike' });
    assert.equal(
      code(() => p({ name: '   ' })),
      'VALIDATION_ERROR',
    );
    assert.equal(
      code(() => p({ name: 'x', userId: UUID })),
      'VALIDATION_ERROR',
    );
  });

  it('update: needs at least one known field', () => {
    const p = parse(updateScenarioSchema);
    assert.deepEqual(p({ isActive: true }), { isActive: true });
    assert.equal(
      code(() => p({})),
      'VALIDATION_ERROR',
    );
    assert.equal(
      code(() => p({ isActive: 'yes' })),
      'VALIDATION_ERROR',
    );
  });

  it('simulate: needs a shipment id and a known objective', () => {
    const p = parse(simulateSchema);
    assert.deepEqual(p({ shipmentId: UUID }), { shipmentId: UUID });
    assert.equal(
      code(() => p({ shipmentId: UUID, objective: 'best' })),
      'VALIDATION_ERROR',
    );
    assert.equal(
      code(() => p({})),
      'VALIDATION_ERROR',
    );
  });

  it('path ids must be uuids', () => {
    assert.equal(parse(idSchema)(UUID), UUID);
    assert.equal(
      code(() => parse(idSchema)('abc')),
      'VALIDATION_ERROR',
    );
  });

  it('the router builds and exposes the expected routes', () => {
    const router = scenariosRouter();
    const seen = router.stack
      .filter((l) => l.route)
      .flatMap((l) => Object.keys(l.route.methods).map((m) => `${m} ${l.route.path}`))
      .sort();
    assert.deepEqual(seen, [
      'delete /:id',
      'delete /:id/effects/:effectId',
      'get /',
      'get /:id',
      'patch /:id',
      'post /',
      'post /:id/effects',
      'post /:id/simulate',
    ]);
  });
});
