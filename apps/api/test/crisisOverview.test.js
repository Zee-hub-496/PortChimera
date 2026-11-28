import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../../../packages/core/src/index.js';
import { crisisOverview } from '../src/modules/scenarios/service.js';
import { createScenario } from '../src/modules/scenarios/service.js';
import { createShipment } from '../src/modules/shipments/service.js';
import { fakeDbFactory } from './helpers/fakes.js';
import { seedAsDbRows } from './helpers/network.js';

const { ports, edges } = seedAsDbRows();
const portId = (code) => ports.find((p) => p.code === code).id;
const silent = { error() {}, warn() {}, log() {} };

function setup() {
  const tables = {
    ports: structuredClone(ports),
    shipping_edges: structuredClone(edges),
    shipments: [],
    disruption_scenarios: [],
    scenario_effects: [],
    route_results: [],
    audit_logs: [],
  };
  const factory = fakeDbFactory(tables, { shared: ['ports', 'shipping_edges'] });
  return {
    tables,
    alice: factory.createDb('alice-token'),
    bob: factory.createDb('bob-token'),
  };
}

const ship = (db, userId, number, to) =>
  createShipment(db, userId, {
    shipmentNumber: number,
    originPortCode: 'CNSHA',
    destinationPortCode: to,
  });
const crisis = (db, userId, name, code, type = 'port_strike') =>
  createScenario(db, userId, { name, effects: [{ type, portId: portId(code) }] }, core, silent);

describe('crisisOverview', () => {
  it('is empty and cheap when there are no scenarios', async () => {
    const t = setup();
    await ship(t.alice, 'user-alice', 'A-1', 'PKKHI');
    const o = await crisisOverview(t.alice, 'user-alice', core, silent);
    assert.deepEqual(o.crises, []);
    assert.equal(o.affectedShipments, 0);
    assert.equal(o.checked.scenarios, 0);
    assert.equal(o.dataLabel, 'illustrative');
  });

  it('lists only the shipments a crisis really changes, with the new route and the extra cost and time', async () => {
    const t = setup();
    await ship(t.alice, 'user-alice', 'ON-ROUTE', 'PKKHI'); // goes through Singapore
    await ship(t.alice, 'user-alice', 'OFF-ROUTE', 'JPYOK'); // does not
    await crisis(t.alice, 'user-alice', 'Singapore strike', 'SGSIN');

    const o = await crisisOverview(t.alice, 'user-alice', core, silent);
    assert.equal(o.crises.length, 1);
    assert.equal(o.crises[0].name, 'Singapore strike');
    assert.deepEqual(o.crises[0].effects, [
      { type: 'port_strike', kind: 'port', target: 'Singapore' },
    ]);
    assert.equal(o.crises[0].affected.length, 1);
    const hit = o.crises[0].affected[0];
    assert.equal(hit.shipmentNumber, 'ON-ROUTE');
    assert.equal(hit.status, 'rerouted');
    assert.deepEqual(hit.origin.code, 'CNSHA');
    assert.deepEqual(hit.destination.code, 'PKKHI');
    assert.ok(hit.baseline.pathNames.includes('Singapore'));
    assert.ok(!hit.disrupted.pathNames.includes('Singapore'));
    assert.ok(hit.added.days > 0 || hit.added.costUsd > 0);
    assert.equal(o.affectedShipments, 1);
    assert.equal(o.checked.shipments, 2);
  });

  it('keeps a crisis that hits nothing, so the page can say so', async () => {
    const t = setup();
    await ship(t.alice, 'user-alice', 'A-1', 'JPYOK');
    await crisis(t.alice, 'user-alice', 'Rotterdam strike', 'NLRTM');
    const o = await crisisOverview(t.alice, 'user-alice', core, silent);
    assert.equal(o.crises.length, 1);
    assert.equal(o.crises[0].affected.length, 0);
    assert.equal(o.affectedShipments, 0);
  });

  it('reports a closed origin as affected, with no second route', async () => {
    const t = setup();
    await ship(t.alice, 'user-alice', 'A-1', 'PKKHI');
    await crisis(t.alice, 'user-alice', 'Shanghai strike', 'CNSHA');
    const o = await crisisOverview(t.alice, 'user-alice', core, silent);
    const hit = o.crises[0].affected[0];
    assert.equal(hit.status, 'origin_closed');
    assert.equal(hit.disrupted, null);
  });

  it('counts a shipment once even when two crises hit it', async () => {
    const t = setup();
    await ship(t.alice, 'user-alice', 'A-1', 'PKKHI');
    await crisis(t.alice, 'user-alice', 'One', 'SGSIN');
    await crisis(t.alice, 'user-alice', 'Two', 'SGSIN', 'port_congestion');
    const o = await crisisOverview(t.alice, 'user-alice', core, silent);
    assert.equal(o.crises.length, 2);
    assert.equal(o.affectedShipments, 1);
  });

  it("never shows another user's scenarios or shipments", async () => {
    const t = setup();
    await ship(t.alice, 'user-alice', 'A-1', 'PKKHI');
    await ship(t.bob, 'user-bob', 'B-1', 'PKKHI');
    await crisis(t.bob, 'user-bob', 'Bob strike', 'SGSIN');
    const mine = await crisisOverview(t.alice, 'user-alice', core, silent);
    assert.deepEqual(mine.crises, []);
    const bobs = await crisisOverview(t.bob, 'user-bob', core, silent);
    assert.equal(bobs.crises[0].affected.length, 1);
    assert.equal(bobs.crises[0].affected[0].shipmentNumber, 'B-1');
    assert.doesNotMatch(JSON.stringify(mine), /B-1|Bob strike|user-bob/);
  });

  it('writes nothing: no route results, no audit entries', async () => {
    const t = setup();
    await ship(t.alice, 'user-alice', 'A-1', 'PKKHI');
    await crisis(t.alice, 'user-alice', 'Singapore strike', 'SGSIN');
    const auditBefore = t.tables.audit_logs.length;
    await crisisOverview(t.alice, 'user-alice', core, silent);
    assert.equal(t.tables.route_results.length, 0);
    assert.equal(t.tables.audit_logs.length, auditBefore);
  });
});

describe('route order', () => {
  it('registers /impact above /:id so it is not read as a scenario id', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(
      new URL('../src/modules/scenarios/routes.js', import.meta.url),
      'utf8',
    );
    const impact = src.indexOf("router.get('/impact'");
    const byId = src.indexOf("router.get('/:id'");
    assert.ok(impact > -1 && byId > -1);
    assert.ok(impact < byId);
  });
});
