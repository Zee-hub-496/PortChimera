import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../../../packages/core/src/index.js';
import { AppError } from '../src/middleware/errorHandler.js';
import { mapRowsToGraphInput } from '../src/modules/routes/mapRows.js';
import { calculateRoute } from '../src/modules/routes/service.js';
import { routeHandlers } from '../src/modules/routes/handlers.js';
import { createShipment } from '../src/modules/shipments/service.js';
import { fakeDbFactory, fakeRes } from './helpers/fakes.js';
import { seedAsDbRows } from './helpers/network.js';

const { ports, edges } = seedAsDbRows();

function setup() {
  const factory = fakeDbFactory(
    { ports, shipping_edges: edges, shipments: [], audit_logs: [] },
    { shared: ['ports', 'shipping_edges'] },
  );
  return { alice: factory.createDb('alice-token'), bob: factory.createDb('bob-token') };
}

const rejects = (promise, status, code) =>
  assert.rejects(promise, (e) => e instanceof AppError && e.status === status && e.code === code);

const make = (db, userId, to = 'PKKHI') =>
  createShipment(db, userId, {
    shipmentNumber: 'R-1',
    originPortCode: 'CNSHA',
    destinationPortCode: to,
  });

describe('mapRowsToGraphInput', () => {
  it('converts uuids to port codes and snake_case to camelCase', () => {
    const out = mapRowsToGraphInput(ports, edges);
    assert.equal(out.ports.length, ports.length);
    assert.equal(out.edges.length, edges.length);
    assert.deepEqual(Object.keys(out.edges[0]).sort(), [
      'distanceKm',
      'freightCostUsd',
      'from',
      'id',
      'riskScore',
      'to',
      'transitDays',
    ]);
    assert.match(out.edges[0].from, /^[A-Z]{5}$/);
    assert.equal(out.dataLabel, 'illustrative');
    assert.doesNotThrow(() => core.buildGraph(out.ports, out.edges));
  });

  it('converts numeric strings and skips edges with unknown ports', () => {
    const out = mapRowsToGraphInput(
      [{ id: 'a', code: 'AAAAA', name: 'A', lat: '1', lon: '2', data_label: 'x' }],
      [
        {
          id: 'e',
          source_port_id: 'a',
          destination_port_id: 'nope',
          distance_km: '1',
          transit_days: '1',
          freight_cost_usd: '1',
          risk_score: '0',
        },
      ],
    );
    assert.equal(out.edges.length, 0);
    assert.equal(out.ports[0].lat, 1);
  });
});

describe('calculateRoute', () => {
  it('finds CNSHA to PKKHI over the seed data with port names', async () => {
    const { alice } = setup();
    const s = await make(alice, 'user-alice');
    const r = await calculateRoute(alice, 'user-alice', { shipmentId: s.id }, core);
    assert.equal(r.status, 'found');
    assert.equal(r.objective, 'fastest');
    assert.equal(r.dataLabel, 'illustrative');
    assert.equal(r.path[0].code, 'CNSHA');
    assert.equal(r.path[0].name, 'Shanghai');
    assert.equal(r.path.at(-1).code, 'PKKHI');
    assert.ok(r.totals.transitDays > 0);
  });

  it('supports other objectives', async () => {
    const { alice } = setup();
    const s = await make(alice, 'user-alice');
    const r = await calculateRoute(
      alice,
      'user-alice',
      { shipmentId: s.id, objective: 'cheapest' },
      core,
    );
    assert.equal(r.objective, 'cheapest');
    assert.equal(r.status, 'found');
  });

  it("returns 404 for another user's shipment and for a missing one", async () => {
    const { alice, bob } = setup();
    const s = await make(alice, 'user-alice');
    await rejects(
      calculateRoute(bob, 'user-bob', { shipmentId: s.id }, core),
      404,
      'SHIPMENT_NOT_FOUND',
    );
    await rejects(
      calculateRoute(alice, 'user-alice', { shipmentId: 'nope' }, core),
      404,
      'SHIPMENT_NOT_FOUND',
    );
  });

  it('rejects an unknown objective with 422', async () => {
    const { alice } = setup();
    const s = await make(alice, 'user-alice');
    await rejects(
      calculateRoute(alice, 'user-alice', { shipmentId: s.id, objective: 'scenic' }, core),
      422,
      'INVALID_OBJECTIVE',
    );
  });

  it('returns no_route as a normal result when no lanes connect', async () => {
    const factory = fakeDbFactory(
      { ports, shipping_edges: [], shipments: [], audit_logs: [] },
      { shared: ['ports', 'shipping_edges'] },
    );
    const alice = factory.createDb('alice-token');
    const s = await make(alice, 'user-alice');
    const r = await calculateRoute(alice, 'user-alice', { shipmentId: s.id }, core);
    assert.equal(r.status, 'no_route');
    assert.deepEqual(r.path, []);
    assert.ok(r.reason);
  });

  it('maps bad network data (RoutingInputError) to 422', async () => {
    const bad = edges.map((e, i) => (i === 0 ? { ...e, distance_km: 1 } : e));
    const factory = fakeDbFactory(
      { ports, shipping_edges: bad, shipments: [], audit_logs: [] },
      { shared: ['ports', 'shipping_edges'] },
    );
    const alice = factory.createDb('alice-token');
    const s = await make(alice, 'user-alice');
    await rejects(
      calculateRoute(alice, 'user-alice', { shipmentId: s.id }, core),
      422,
      'ROUTING_INPUT_INVALID',
    );
  });
});

describe('route handlers', () => {
  it('uses the signed-in user and returns the {data} envelope', async () => {
    const { alice, bob } = setup();
    const s = await make(alice, 'user-alice');
    const h = routeHandlers({ parseCalculate: (b) => b, engine: core });
    const res = fakeRes();
    await h.calculate(
      { auth: { userId: 'user-alice' }, db: alice, body: { shipmentId: s.id } },
      res,
    );
    assert.equal(res.body.data.status, 'found');
    await rejects(
      h.calculate({ auth: { userId: 'user-bob' }, db: bob, body: { shipmentId: s.id } }, fakeRes()),
      404,
      'SHIPMENT_NOT_FOUND',
    );
  });
});
