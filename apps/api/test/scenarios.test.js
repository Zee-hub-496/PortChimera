import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../../../packages/core/src/index.js';
import { AppError } from '../src/middleware/errorHandler.js';
import { mapRowsToGraphInput } from '../src/modules/routes/mapRows.js';
import { scenarioHandlers } from '../src/modules/scenarios/handlers.js';
import { createShipment } from '../src/modules/shipments/service.js';
import { fakeDbFactory, fakeRes } from './helpers/fakes.js';
import { seedAsDbRows } from './helpers/network.js';

const { ports, edges } = seedAsDbRows();
const portId = (code) => ports.find((p) => p.code === code).id;
const edgeId = (from, to) =>
  edges.find((e) => e.source_port_id === portId(from) && e.destination_port_id === portId(to)).id;

const silent = { error() {}, warn() {}, log() {} };
const isId = (v) => typeof v === 'string' && v !== '';
const bad = (code) => (v) => {
  if (v === undefined || v === null) throw new AppError(422, 'VALIDATION_ERROR', `${code} missing`);
  return v;
};
// Plain parsers: zod is not needed here (the zod schemas have their own test file).
const parsers = {
  id: (v) => {
    if (!isId(v)) throw new AppError(422, 'VALIDATION_ERROR', 'bad id');
    return v;
  },
  create: bad('body'),
  update: bad('body'),
  effect: bad('body'),
  simulate: bad('body'),
};

function setup({ rls = true } = {}) {
  const tables = {
    ports: structuredClone(ports),
    shipping_edges: structuredClone(edges),
    shipments: [],
    disruption_scenarios: [],
    scenario_effects: [],
    route_results: [],
    audit_logs: [],
  };
  const factory = fakeDbFactory(tables, { shared: ['ports', 'shipping_edges'], rls });
  const h = scenarioHandlers({ parsers, engine: core, logger: silent });
  const alice = factory.createDb('alice-token');
  const bob = factory.createDb('bob-token');
  const as = (db, userId, extra = {}) => ({ db, auth: { userId }, params: {}, body: {}, ...extra });
  return {
    tables,
    factory,
    h,
    alice,
    bob,
    asAlice: (extra) => as(alice, 'user-alice', extra),
    asBob: (extra) => as(bob, 'user-bob', extra),
  };
}

const call = async (fn, req) => {
  const res = fakeRes();
  await fn(req, res);
  return res;
};

const rejects = (promise, status, code) =>
  assert.rejects(promise, (e) => e instanceof AppError && e.status === status && e.code === code);

const shipment = (db, userId, to = 'PKKHI', number = 'S-1') =>
  createShipment(db, userId, {
    shipmentNumber: number,
    originPortCode: 'CNSHA',
    destinationPortCode: to,
  });

const strike = (code) => ({ type: 'port_strike', portId: portId(code) });

async function newScenario(ctx, body = { name: 'Test', effects: [strike('SGSIN')] }) {
  const res = await call(ctx.h.create, ctx.asAlice({ body }));
  return res.body.data;
}

describe('create, read, update, delete', () => {
  it('creates a scenario with effects and hides the user id', async () => {
    const ctx = setup();
    const res = await call(
      ctx.h.create,
      ctx.asAlice({ body: { name: ' Singapore strike ', effects: [strike('SGSIN')] } }),
    );
    assert.equal(res.statusCode, 201);
    const s = res.body.data;
    assert.equal(s.isActive, false);
    assert.equal(s.effects.length, 1);
    assert.equal(s.effects[0].type, 'port_strike');
    assert.equal(s.effects[0].portId, portId('SGSIN'));
    assert.equal(s.effects[0].edgeId, null);
    assert.doesNotMatch(JSON.stringify(res.body), /user_id|owner|user-alice/);
    assert.equal(ctx.tables.disruption_scenarios[0].user_id, 'user-alice');
  });

  it('lists only the caller scenarios, with their effects', async () => {
    const ctx = setup();
    await newScenario(ctx);
    await call(ctx.h.create, ctx.asBob({ body: { name: 'Bob', effects: [strike('LKCMB')] } }));
    const mine = (await call(ctx.h.list, ctx.asAlice())).body.data;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].name, 'Test');
    assert.equal(mine[0].effects.length, 1);
  });

  it('updates the name and the active flag', async () => {
    const ctx = setup();
    const s = await newScenario(ctx);
    const res = await call(
      ctx.h.update,
      ctx.asAlice({ params: { id: s.id }, body: { name: 'Renamed', isActive: true } }),
    );
    assert.equal(res.body.data.name, 'Renamed');
    assert.equal(res.body.data.isActive, true);
    assert.equal(ctx.tables.disruption_scenarios[0].is_active, true);
  });

  it('deletes a scenario together with its saved route results, and keeps baseline rows', async () => {
    const ctx = setup();
    const s = await newScenario(ctx);
    const sh = await shipment(ctx.alice, 'user-alice');
    await call(ctx.h.simulate, ctx.asAlice({ params: { id: s.id }, body: { shipmentId: sh.id } }));
    assert.equal(ctx.tables.route_results.length, 2);
    const res = await call(ctx.h.remove, ctx.asAlice({ params: { id: s.id } }));
    assert.deepEqual(res.body, { data: { id: s.id } });
    assert.equal(ctx.tables.disruption_scenarios.length, 0);
    // The disrupted row is gone; it must not be left behind looking like a baseline route.
    assert.deepEqual(
      ctx.tables.route_results.map((r) => r.scenario_id),
      [null],
    );
  });
});

describe('validation against the real network', () => {
  it('rejects an unknown port id with 422 and stores nothing', async () => {
    const ctx = setup();
    await rejects(
      call(
        ctx.h.create,
        ctx.asAlice({ body: { name: 'x', effects: [{ type: 'port_strike', portId: 'nope' }] } }),
      ),
      422,
      'UNKNOWN_PORT',
    );
    assert.equal(ctx.tables.disruption_scenarios.length, 0);
  });

  it('rejects an unknown lane id with 422', async () => {
    const ctx = setup();
    await rejects(
      call(
        ctx.h.create,
        ctx.asAlice({
          body: { name: 'x', effects: [{ type: 'connection_failure', edgeId: 'nope' }] },
        }),
      ),
      422,
      'UNKNOWN_LANE',
    );
  });

  it('rejects an effect type that does not fit its target', async () => {
    const ctx = setup();
    const lane = edgeId('CNSHA', 'SGSIN');
    await rejects(
      call(
        ctx.h.create,
        ctx.asAlice({ body: { name: 'x', effects: [{ type: 'port_strike', edgeId: lane }] } }),
      ),
      422,
      'EFFECT_INVALID',
    );
    await rejects(
      call(
        ctx.h.create,
        ctx.asAlice({
          body: { name: 'x', effects: [{ type: 'connection_failure', portId: portId('SGSIN') }] },
        }),
      ),
      422,
      'EFFECT_INVALID',
    );
    assert.equal(ctx.tables.disruption_scenarios.length, 0);
  });

  it('accepts severe weather on a port or on a lane', async () => {
    const ctx = setup();
    const s = await newScenario(ctx, {
      name: 'Storm',
      effects: [
        { type: 'severe_weather', portId: portId('SGSIN') },
        { type: 'severe_weather', edgeId: edgeId('CNSHA', 'SGSIN') },
      ],
    });
    assert.equal(s.effects.length, 2);
  });

  it('rejects the same target listed twice', async () => {
    const ctx = setup();
    await rejects(
      call(
        ctx.h.create,
        ctx.asAlice({ body: { name: 'x', effects: [strike('SGSIN'), strike('SGSIN')] } }),
      ),
      422,
      'EFFECT_DUPLICATE',
    );
  });
});

describe('close and reopen', () => {
  it('adds an effect (close) and removes it (reopen)', async () => {
    const ctx = setup();
    const s = await newScenario(ctx, { name: 'Empty' });
    const added = await call(
      ctx.h.addEffect,
      ctx.asAlice({ params: { id: s.id }, body: strike('SGSIN') }),
    );
    assert.equal(added.statusCode, 201);
    assert.equal(added.body.data.effects.length, 1);
    const effectId = added.body.data.effects[0].id;
    const removed = await call(ctx.h.removeEffect, ctx.asAlice({ params: { id: s.id, effectId } }));
    assert.equal(removed.body.data.effects.length, 0);
  });

  it('answers 409 for a port that is already closed', async () => {
    const ctx = setup();
    const s = await newScenario(ctx);
    await rejects(
      call(ctx.h.addEffect, ctx.asAlice({ params: { id: s.id }, body: strike('SGSIN') })),
      409,
      'EFFECT_EXISTS',
    );
  });

  it('answers 404 for an effect id that belongs to another scenario', async () => {
    const ctx = setup();
    const a = await newScenario(ctx);
    const b = await newScenario(ctx, { name: 'B', effects: [strike('LKCMB')] });
    await rejects(
      call(ctx.h.removeEffect, ctx.asAlice({ params: { id: a.id, effectId: b.effects[0].id } })),
      404,
      'EFFECT_NOT_FOUND',
    );
    assert.equal(ctx.tables.scenario_effects.length, 2);
  });

  it('clears saved results when the effects change, so none are stale', async () => {
    const ctx = setup();
    const s = await newScenario(ctx);
    const sh = await shipment(ctx.alice, 'user-alice');
    await call(ctx.h.simulate, ctx.asAlice({ params: { id: s.id }, body: { shipmentId: sh.id } }));
    assert.equal(ctx.tables.route_results.filter((r) => r.scenario_id === s.id).length, 1);
    await call(
      ctx.h.removeEffect,
      ctx.asAlice({ params: { id: s.id, effectId: s.effects[0].id } }),
    );
    assert.equal(ctx.tables.route_results.filter((r) => r.scenario_id === s.id).length, 0);
  });
});

describe('ownership', () => {
  it('answers 404 to another user for every scenario route, and changes nothing', async () => {
    const ctx = setup();
    const s = await newScenario(ctx);
    const bobShipment = await shipment(ctx.bob, 'user-bob');
    const before = JSON.stringify(ctx.tables);
    const id = s.id;
    const effectId = s.effects[0].id;
    for (const [fn, extra] of [
      [ctx.h.get, { params: { id } }],
      [ctx.h.update, { params: { id }, body: { name: 'hacked' } }],
      [ctx.h.remove, { params: { id } }],
      [ctx.h.addEffect, { params: { id }, body: strike('LKCMB') }],
      [ctx.h.removeEffect, { params: { id, effectId } }],
      [ctx.h.simulate, { params: { id }, body: { shipmentId: bobShipment.id } }],
    ]) {
      await rejects(call(fn, ctx.asBob(extra)), 404, 'SCENARIO_NOT_FOUND');
    }
    assert.equal(JSON.stringify(ctx.tables), before);
  });

  it('is owner only even when row level security is off (code-level check)', async () => {
    const ctx = setup({ rls: false });
    const s = await newScenario(ctx);
    await rejects(call(ctx.h.get, ctx.asBob({ params: { id: s.id } })), 404, 'SCENARIO_NOT_FOUND');
    await rejects(
      call(ctx.h.remove, ctx.asBob({ params: { id: s.id } })),
      404,
      'SCENARIO_NOT_FOUND',
    );
    assert.equal(ctx.tables.disruption_scenarios.length, 1);
  });

  it("answers 404 when simulating with another user's shipment", async () => {
    const ctx = setup();
    const s = await newScenario(ctx);
    const bobShipment = await shipment(ctx.bob, 'user-bob');
    await rejects(
      call(
        ctx.h.simulate,
        ctx.asAlice({ params: { id: s.id }, body: { shipmentId: bobShipment.id } }),
      ),
      404,
      'SHIPMENT_NOT_FOUND',
    );
  });
});

describe('simulate', () => {
  const graph = () => {
    const input = mapRowsToGraphInput(ports, edges);
    return core.buildGraph(input.ports, input.edges, { dataLabel: input.dataLabel });
  };
  const run = async (ctx, scenario, sh, objective) => {
    const body = objective ? { shipmentId: sh.id, objective } : { shipmentId: sh.id };
    return (await call(ctx.h.simulate, ctx.asAlice({ params: { id: scenario.id }, body }))).body
      .data;
  };

  it('gives the same routes as core for the Singapore strike (Shanghai to Karachi)', async () => {
    const ctx = setup();
    const s = await newScenario(ctx);
    const sh = await shipment(ctx.alice, 'user-alice');
    const out = await run(ctx, s, sh);
    const direct = core.simulateDisruption(
      graph(),
      [{ type: 'port_strike', portCode: 'SGSIN' }],
      'CNSHA',
      'PKKHI',
      'fastest',
    );
    assert.equal(out.status, 'rerouted');
    assert.equal(out.status, direct.status);
    assert.deepEqual(out.baseline.path, direct.baseline.path);
    assert.deepEqual(out.disrupted.path, direct.disrupted.path);
    assert.deepEqual(out.added, direct.added);
    assert.equal(out.explanation, direct.explanation);
    assert.ok(out.disrupted.path.includes('MYPKG') && out.disrupted.path.includes('LKCMB'));
    assert.ok(out.added.days > 0);
  });

  it('matches core for every objective', async () => {
    const ctx = setup();
    const s = await newScenario(ctx);
    const sh = await shipment(ctx.alice, 'user-alice');
    for (const objective of ['fastest', 'cheapest', 'lowest_risk']) {
      const out = await run(ctx, s, sh, objective);
      const direct = core.simulateDisruption(
        graph(),
        [{ type: 'port_strike', portCode: 'SGSIN' }],
        'CNSHA',
        'PKKHI',
        objective,
      );
      assert.equal(out.status, direct.status, objective);
      assert.deepEqual(out.disrupted?.path ?? null, direct.disrupted?.path ?? null, objective);
    }
  });

  it('reports unaffected when the closure is off the route, and still saves the route', async () => {
    const ctx = setup();
    const s = await newScenario(ctx, { name: 'Far away', effects: [strike('USLAX')] });
    const sh = await shipment(ctx.alice, 'user-alice');
    const out = await run(ctx, s, sh);
    assert.equal(out.status, 'unaffected');
    assert.deepEqual(out.baseline.path, out.disrupted.path);
    assert.equal(ctx.tables.route_results.length, 2);
  });

  it('reports a closed destination and a closed origin without saving a route', async () => {
    const ctx = setup();
    const sh = await shipment(ctx.alice, 'user-alice');
    const dest = await newScenario(ctx, { name: 'D', effects: [strike('PKKHI')] });
    const origin = await newScenario(ctx, { name: 'O', effects: [strike('CNSHA')] });
    assert.equal((await run(ctx, dest, sh)).status, 'destination_closed');
    assert.equal((await run(ctx, origin, sh)).status, 'origin_closed');
    assert.equal(ctx.tables.route_results.length, 0);
  });

  it('reports no_route when every lane into the destination is closed', async () => {
    const ctx = setup();
    const into = edges
      .filter((e) => e.destination_port_id === portId('PKKHI'))
      .map((e) => ({ type: 'connection_failure', edgeId: e.id }));
    const s = await newScenario(ctx, { name: 'Cut off', effects: into });
    const sh = await shipment(ctx.alice, 'user-alice');
    const out = await run(ctx, s, sh);
    assert.equal(out.status, 'no_route');
    assert.equal(out.disrupted, null);
    assert.equal(out.savedResultId, null);
    assert.equal(ctx.tables.route_results.length, 0);
  });

  it('saves a baseline row and a disrupted row, and a re-run replaces instead of duplicating', async () => {
    const ctx = setup();
    const s = await newScenario(ctx);
    const sh = await shipment(ctx.alice, 'user-alice');
    const first = await run(ctx, s, sh);
    const second = await run(ctx, s, sh);
    assert.equal(ctx.tables.route_results.length, 2);
    const baseline = ctx.tables.route_results.find((r) => r.scenario_id === null);
    const disrupted = ctx.tables.route_results.find((r) => r.scenario_id === s.id);
    assert.deepEqual(baseline.path, first.baseline.path);
    assert.deepEqual(disrupted.path, first.disrupted.path);
    assert.equal(disrupted.total_days, first.disrupted.totals.transitDays);
    assert.equal(disrupted.total_cost_usd, first.disrupted.totals.freightCostUsd);
    assert.equal(disrupted.explanation, first.explanation);
    assert.equal(disrupted.data_label, 'illustrative');
    assert.equal(second.savedResultId, disrupted.id);
  });

  it('rejects an unknown objective with 422', async () => {
    const ctx = setup();
    const s = await newScenario(ctx);
    const sh = await shipment(ctx.alice, 'user-alice');
    await rejects(
      call(
        ctx.h.simulate,
        ctx.asAlice({
          params: { id: s.id },
          body: { shipmentId: sh.id, objective: 'fastest-ever' },
        }),
      ),
      422,
      'INVALID_OBJECTIVE',
    );
  });

  it('does not leak internal route objects or ids of other users', async () => {
    const ctx = setup();
    const s = await newScenario(ctx);
    const sh = await shipment(ctx.alice, 'user-alice');
    const out = await run(ctx, s, sh);
    assert.deepEqual(Object.keys(out.baseline).sort(), ['path', 'pathNames', 'totals']);
    assert.doesNotMatch(JSON.stringify(out), /user_id|owner|user-alice|edges|expanded/);
  });
});

describe('shared network and audit', () => {
  it('never writes the shared ports or shipping_edges tables', async () => {
    const ctx = setup();
    const s = await newScenario(ctx);
    const sh = await shipment(ctx.alice, 'user-alice');
    await call(ctx.h.simulate, ctx.asAlice({ params: { id: s.id }, body: { shipmentId: sh.id } }));
    await call(ctx.h.addEffect, ctx.asAlice({ params: { id: s.id }, body: strike('LKCMB') }));
    await call(ctx.h.update, ctx.asAlice({ params: { id: s.id }, body: { isActive: true } }));
    await call(ctx.h.remove, ctx.asAlice({ params: { id: s.id } }));
    const shared = new Set(['ports', 'shipping_edges']);
    for (const log of [ctx.factory.inserts, ctx.factory.updates, ctx.factory.deletes]) {
      assert.deepEqual(
        log.filter((w) => shared.has(w.table)),
        [],
      );
    }
    assert.deepEqual(
      ctx.tables.ports,
      ports.map((p) => ({ ...p })),
    );
    assert.deepEqual(
      ctx.tables.shipping_edges,
      edges.map((e) => ({ ...e })),
    );
  });

  it('writes an audit entry for every state-changing action', async () => {
    const ctx = setup();
    const s = await newScenario(ctx, { name: 'A' });
    const sh = await shipment(ctx.alice, 'user-alice');
    const added = await call(
      ctx.h.addEffect,
      ctx.asAlice({ params: { id: s.id }, body: strike('SGSIN') }),
    );
    await call(ctx.h.simulate, ctx.asAlice({ params: { id: s.id }, body: { shipmentId: sh.id } }));
    await call(
      ctx.h.removeEffect,
      ctx.asAlice({ params: { id: s.id, effectId: added.body.data.effects[0].id } }),
    );
    await call(ctx.h.update, ctx.asAlice({ params: { id: s.id }, body: { name: 'B' } }));
    await call(ctx.h.remove, ctx.asAlice({ params: { id: s.id } }));
    const actions = ctx.tables.audit_logs.map((a) => a.action);
    for (const expected of [
      'scenario.created',
      'scenario.effect_added',
      'scenario.simulated',
      'scenario.effect_removed',
      'scenario.updated',
      'scenario.deleted',
    ]) {
      assert.ok(actions.includes(expected), expected);
    }
    const sim = ctx.tables.audit_logs.find((a) => a.action === 'scenario.simulated');
    assert.equal(sim.details.status, 'rerouted');
    assert.equal(sim.shipment_id, sh.id);
  });

  it('keeps working when the audit write fails', async () => {
    const ctx = setup();
    const failingAudit = {
      ...ctx.alice,
      from: (t) =>
        t === 'audit_logs' ? { insert: async () => ({ error: { code: 'x' } }) } : ctx.alice.from(t),
    };
    const res = await call(ctx.h.create, {
      db: failingAudit,
      auth: { userId: 'user-alice' },
      params: {},
      body: { name: 'ok' },
    });
    assert.equal(res.statusCode, 201);
  });
});
