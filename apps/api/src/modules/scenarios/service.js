import { AppError } from '../../middleware/errorHandler.js';
import { recordAudit } from '../audit/service.js';
import { getShipmentRow } from '../shipments/service.js';
import { mapRowsToGraphInput } from '../routes/mapRows.js';
import { toScenarioView, toSimulationView } from './view.js';

// Everything here works on the caller's own database client, so Row Level Security applies.
// The shared tables `ports` and `shipping_edges` are only ever READ. A scenario never edits the
// shared network: it is a list of "closed" markers that is applied to a private copy in memory.

const SELECT_PORTS = 'id, code, name, lat, lon, data_label';
const SELECT_EDGES =
  'id, source_port_id, destination_port_id, distance_km, transit_days, freight_cost_usd, risk_score, data_label';

/** Audit failures are logged, not fatal (same policy as documents and shipments). */
async function audit(db, entry, logger) {
  try {
    await recordAudit(db, entry);
  } catch (err) {
    logger.error('audit_write_failed', {
      action: entry.action,
      userId: entry.userId,
      reason: err?.code ?? err?.message,
    });
  }
}

async function loadNetwork(db) {
  const [portsRes, edgesRes] = await Promise.all([
    db.from('ports').select(SELECT_PORTS),
    db.from('shipping_edges').select(SELECT_EDGES),
  ]);
  if (portsRes.error || edgesRes.error) {
    throw new AppError(500, 'ROUTE_DATA_FAILED', 'Could not load the shipping network');
  }
  return { portRows: portsRes.data ?? [], edgeRows: edgesRes.data ?? [] };
}

function buildNetworkGraph(network, engine) {
  const input = mapRowsToGraphInput(network.portRows, network.edgeRows);
  try {
    return engine.buildGraph(input.ports, input.edges, { dataLabel: input.dataLabel });
  } catch (err) {
    if (err instanceof engine.RoutingInputError) {
      throw new AppError(422, 'ROUTING_INPUT_INVALID', err.message);
    }
    throw err;
  }
}

/**
 * Turns effects given by database id (portId / edgeId) into core effects (port codes), checking
 * that every id exists in the real network and that the type fits the target (a strike closes a
 * port, a connection failure closes a lane). Unknown ids are rejected, never ignored.
 */
function toCoreEffects(items, network, graph, engine) {
  const portById = new Map(network.portRows.map((p) => [p.id, p]));
  const edgeById = new Map(network.edgeRows.map((e) => [e.id, e]));
  const core = items.map((item, i) => {
    const where = `Effect ${i + 1}`;
    if (item.portId) {
      const port = portById.get(item.portId);
      if (!port)
        throw new AppError(422, 'UNKNOWN_PORT', `${where}: that port is not in the network`);
      return { type: item.type, portCode: port.code };
    }
    const edge = edgeById.get(item.edgeId);
    if (!edge) throw new AppError(422, 'UNKNOWN_LANE', `${where}: that lane is not in the network`);
    return {
      type: item.type,
      from: portById.get(edge.source_port_id)?.code,
      to: portById.get(edge.destination_port_id)?.code,
    };
  });
  try {
    engine.validateEffects(graph, core);
  } catch (err) {
    if (err instanceof engine.RoutingInputError) {
      throw new AppError(422, 'EFFECT_INVALID', err.message);
    }
    throw err;
  }
  return core;
}

const targetOf = (item) => (item.portId ? `port:${item.portId}` : `edge:${item.edgeId}`);
const rowTarget = (row) => (row.port_id ? `port:${row.port_id}` : `edge:${row.edge_id}`);
const rowAsItem = (row) => ({
  type: row.effect_type,
  portId: row.port_id ?? undefined,
  edgeId: row.edge_id ?? undefined,
});

async function getScenarioRow(db, userId, id) {
  const { data, error } = await db
    .from('disruption_scenarios')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new AppError(500, 'SCENARIO_LOOKUP_FAILED', 'Could not load the scenario');
  // Row Level Security already hides other users' rows; the user_id check is a second lock.
  if (!data || data.user_id !== userId) {
    throw new AppError(404, 'SCENARIO_NOT_FOUND', 'Scenario not found');
  }
  return data;
}

async function getEffectRows(db, scenarioIds) {
  if (scenarioIds.length === 0) return [];
  const { data, error } = await db
    .from('scenario_effects')
    .select('*')
    .in('scenario_id', scenarioIds)
    .order('created_at', { ascending: true });
  if (error) throw new AppError(500, 'EFFECT_LOOKUP_FAILED', 'Could not load the scenario effects');
  return data ?? [];
}

async function scenarioView(db, row) {
  return toScenarioView(row, await getEffectRows(db, [row.id]));
}

/** Saved route results of a scenario go stale when its effects change, and must not outlive it. */
async function clearResults(db, scenarioId) {
  const { error } = await db.from('route_results').delete().eq('scenario_id', scenarioId);
  if (error) throw new AppError(500, 'RESULT_CLEANUP_FAILED', 'Could not clear the saved results');
}

function effectRowsFor(scenarioId, items) {
  return items.map((item) => ({
    scenario_id: scenarioId,
    port_id: item.portId ?? null,
    edge_id: item.edgeId ?? null,
    effect_type: item.type,
    note: item.note ?? null,
  }));
}

/** Creates a scenario (and optional effects) for the caller. `input` is already parsed. */
export async function createScenario(db, userId, input, engine, logger = console) {
  const items = input.effects ?? [];
  const targets = items.map(targetOf);
  if (new Set(targets).size !== targets.length) {
    throw new AppError(422, 'EFFECT_DUPLICATE', 'The same port or lane is listed twice');
  }
  if (items.length > 0) {
    const network = await loadNetwork(db);
    toCoreEffects(items, network, buildNetworkGraph(network, engine), engine);
  }

  const { data: row, error } = await db
    .from('disruption_scenarios')
    .insert({ user_id: userId, name: input.name })
    .select()
    .single();
  if (error) throw new AppError(500, 'SCENARIO_CREATE_FAILED', 'Could not save the scenario');

  if (items.length > 0) {
    const { error: effectError } = await db
      .from('scenario_effects')
      .insert(effectRowsFor(row.id, items));
    if (effectError) {
      // No transaction: remove the empty scenario so a failed request leaves nothing behind.
      await db.from('disruption_scenarios').delete().eq('id', row.id).eq('user_id', userId);
      throw new AppError(500, 'SCENARIO_CREATE_FAILED', 'Could not save the scenario');
    }
  }
  await audit(
    db,
    {
      userId,
      action: 'scenario.created',
      details: { scenarioId: row.id, effects: items.length },
    },
    logger,
  );
  return scenarioView(db, row);
}

export async function listScenarios(db, userId) {
  const { data, error } = await db
    .from('disruption_scenarios')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new AppError(500, 'SCENARIO_LIST_FAILED', 'Could not load scenarios');
  const rows = data ?? [];
  const effects = await getEffectRows(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((row) =>
    toScenarioView(
      row,
      effects.filter((e) => e.scenario_id === row.id),
    ),
  );
}

export async function getScenario(db, userId, id) {
  return scenarioView(db, await getScenarioRow(db, userId, id));
}

export async function updateScenario(db, userId, id, input, logger = console) {
  await getScenarioRow(db, userId, id);
  const values = {};
  if (input.name !== undefined) values.name = input.name;
  if (input.isActive !== undefined) values.is_active = input.isActive;
  const { data, error } = await db
    .from('disruption_scenarios')
    .update(values)
    .eq('id', id)
    .eq('user_id', userId)
    .select();
  if (error) throw new AppError(500, 'SCENARIO_UPDATE_FAILED', 'Could not update the scenario');
  if (!data || data.length === 0)
    throw new AppError(404, 'SCENARIO_NOT_FOUND', 'Scenario not found');
  await audit(
    db,
    {
      userId,
      action: 'scenario.updated',
      details: { scenarioId: id, fields: Object.keys(values) },
    },
    logger,
  );
  return scenarioView(db, data[0]);
}

/**
 * Deletes a scenario. Its saved route results go first: the database would only set their
 * scenario_id to null, which would make them look like baseline routes.
 */
export async function deleteScenario(db, userId, id, logger = console) {
  await getScenarioRow(db, userId, id);
  await clearResults(db, id);
  const { error } = await db
    .from('disruption_scenarios')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw new AppError(500, 'SCENARIO_DELETE_FAILED', 'Could not delete the scenario');
  await audit(db, { userId, action: 'scenario.deleted', details: { scenarioId: id } }, logger);
  return { id };
}

/** Closes one more port or lane in a scenario. */
export async function addEffect(db, userId, scenarioId, input, engine, logger = console) {
  const row = await getScenarioRow(db, userId, scenarioId);
  const existing = await getEffectRows(db, [scenarioId]);
  if (existing.some((e) => rowTarget(e) === targetOf(input))) {
    throw new AppError(
      409,
      'EFFECT_EXISTS',
      'That port or lane is already closed in this scenario',
    );
  }
  const network = await loadNetwork(db);
  toCoreEffects([input], network, buildNetworkGraph(network, engine), engine);

  const { error } = await db.from('scenario_effects').insert(effectRowsFor(scenarioId, [input]));
  if (error) throw new AppError(500, 'EFFECT_CREATE_FAILED', 'Could not save the effect');
  await clearResults(db, scenarioId);
  await audit(
    db,
    {
      userId,
      action: 'scenario.effect_added',
      details: {
        scenarioId,
        type: input.type,
        portId: input.portId ?? null,
        edgeId: input.edgeId ?? null,
      },
    },
    logger,
  );
  return scenarioView(db, row);
}

/** Reopens a port or lane by removing its effect. */
export async function removeEffect(db, userId, scenarioId, effectId, logger = console) {
  const row = await getScenarioRow(db, userId, scenarioId);
  const { data: effect, error } = await db
    .from('scenario_effects')
    .select('*')
    .eq('id', effectId)
    .eq('scenario_id', scenarioId)
    .maybeSingle();
  if (error) throw new AppError(500, 'EFFECT_LOOKUP_FAILED', 'Could not load the effect');
  if (!effect) throw new AppError(404, 'EFFECT_NOT_FOUND', 'Effect not found');

  const { error: delError } = await db
    .from('scenario_effects')
    .delete()
    .eq('id', effectId)
    .eq('scenario_id', scenarioId);
  if (delError) throw new AppError(500, 'EFFECT_DELETE_FAILED', 'Could not remove the effect');
  await clearResults(db, scenarioId);
  await audit(
    db,
    {
      userId,
      action: 'scenario.effect_removed',
      details: { scenarioId, effectId, type: effect.effect_type },
    },
    logger,
  );
  return scenarioView(db, row);
}

const toDays = (r) => r.totals.transitDays;

/**
 * Saves one disrupted route for (shipment, scenario, objective), replacing the previous run, and
 * a baseline row (scenario_id null) if the shipment has none for this objective yet.
 * Returns the id of the disrupted row.
 */
async function saveResults(db, { shipmentId, scenarioId, result }) {
  const fail = () => new AppError(500, 'RESULT_SAVE_FAILED', 'Could not save the route result');
  const label = result.dataLabel ?? 'illustrative';
  const rowOf = (route, scenario, explanation) => ({
    shipment_id: shipmentId,
    scenario_id: scenario,
    objective: result.objective,
    weights: result.weights,
    path: route.path,
    total_days: toDays(route),
    total_cost_usd: route.totals.freightCostUsd,
    risk_score: route.totals.riskSum,
    explanation,
    data_label: label,
  });

  const { data: existing, error } = await db
    .from('route_results')
    .select('*')
    .eq('shipment_id', shipmentId)
    .eq('objective', result.objective);
  if (error) throw fail();

  const { error: delError } = await db
    .from('route_results')
    .delete()
    .eq('shipment_id', shipmentId)
    .eq('scenario_id', scenarioId)
    .eq('objective', result.objective);
  if (delError) throw fail();

  if (!(existing ?? []).some((r) => r.scenario_id === null || r.scenario_id === undefined)) {
    const { error: baseError } = await db
      .from('route_results')
      .insert(rowOf(result.baseline, null, null));
    if (baseError) throw fail();
  }
  const { data, error: saveError } = await db
    .from('route_results')
    .insert(rowOf(result.disrupted, scenarioId, result.explanation))
    .select()
    .single();
  if (saveError) throw fail();
  return data?.id ?? null;
}

/**
 * Re-plans one of the caller's shipments under one of the caller's scenarios. All the routing
 * and wording come from core's simulateDisruption. Outcomes: rerouted, unaffected, no_route,
 * origin_closed, destination_closed, baseline_unavailable. A route is saved only when one exists
 * (rerouted or unaffected); the other outcomes are returned and written to the audit log.
 */
export async function simulateScenario(db, userId, scenarioId, input, engine, logger = console) {
  const { shipmentId, objective = 'fastest' } = input;
  if (!Object.hasOwn(engine.OBJECTIVES, objective)) {
    throw new AppError(
      422,
      'INVALID_OBJECTIVE',
      `Unknown objective. Use one of: ${Object.keys(engine.OBJECTIVES).join(', ')}`,
    );
  }
  const scenario = await getScenarioRow(db, userId, scenarioId);
  const shipment = await getShipmentRow(db, userId, shipmentId);
  if (!shipment) throw new AppError(404, 'SHIPMENT_NOT_FOUND', 'Shipment not found');
  if (!shipment.origin_port_id || !shipment.destination_port_id) {
    throw new AppError(
      422,
      'SHIPMENT_HAS_NO_PORTS',
      'This shipment has no origin or destination port',
    );
  }

  const network = await loadNetwork(db);
  const codeById = new Map(network.portRows.map((p) => [p.id, p.code]));
  const from = codeById.get(shipment.origin_port_id);
  const to = codeById.get(shipment.destination_port_id);
  if (!from || !to)
    throw new AppError(422, 'UNKNOWN_PORT', 'The shipment ports are not in the network');

  const graph = buildNetworkGraph(network, engine);
  const effectRows = await getEffectRows(db, [scenario.id]);
  const core = toCoreEffects(effectRows.map(rowAsItem), network, graph, engine);

  let result;
  try {
    result = engine.simulateDisruption(graph, core, from, to, objective);
  } catch (err) {
    if (err instanceof engine.RoutingInputError) {
      throw new AppError(422, 'ROUTING_INPUT_INVALID', err.message);
    }
    throw err;
  }

  const savable = result.status === 'rerouted' || result.status === 'unaffected';
  const resultId = savable ? await saveResults(db, { shipmentId, scenarioId, result }) : null;
  await audit(
    db,
    {
      userId,
      shipmentId,
      action: 'scenario.simulated',
      details: { scenarioId, objective: result.objective, status: result.status },
    },
    logger,
  );
  return toSimulationView({ scenarioId, shipmentId, result, resultId });
}

// ---------------------------------------------------------------------------------------------
// Crisis overview: which of the caller's shipments does any saved scenario disturb?
// ---------------------------------------------------------------------------------------------

/** Limits keep one account from making the server run thousands of simulations per request. */
export const OVERVIEW_MAX_SCENARIOS = 20;
export const OVERVIEW_MAX_SHIPMENTS = 100;
const OVERVIEW_OBJECTIVE = 'fastest';
// Outcomes that mean "this crisis changes or blocks the shipment's route".
const AFFECTED = ['rerouted', 'no_route', 'origin_closed', 'destination_closed'];

/**
 * Read-only. Applies every saved scenario of the caller to every shipment of the caller (fastest
 * route) and reports the shipments a scenario affects. Nothing is saved and nothing is audited:
 * it only runs core's simulateDisruption, the same function the route page uses. A "crisis" here
 * is a scenario the user defined (a closed port or lane), not live news.
 */
export async function crisisOverview(db, userId, engine, logger = console) {
  const scenarios = (await listScenarios(db, userId)).filter((s) => s.effects.length > 0);
  const { data: shipmentRows, error } = await db
    .from('shipments')
    .select('id, shipment_number, status, origin_port_id, destination_port_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new AppError(500, 'SHIPMENT_LIST_FAILED', 'Could not load shipments');
  const shipments = (shipmentRows ?? []).filter((s) => s.origin_port_id && s.destination_port_id);

  const usedScenarios = scenarios.slice(0, OVERVIEW_MAX_SCENARIOS);
  const usedShipments = shipments.slice(0, OVERVIEW_MAX_SHIPMENTS);
  const base = {
    objective: OVERVIEW_OBJECTIVE,
    dataLabel: 'illustrative',
    checked: { scenarios: usedScenarios.length, shipments: usedShipments.length },
    limited: scenarios.length > usedScenarios.length || shipments.length > usedShipments.length,
    crises: [],
    affectedShipments: 0,
  };
  if (usedScenarios.length === 0) return base;

  const network = await loadNetwork(db);
  const portById = new Map(network.portRows.map((p) => [p.id, p]));
  const edgeById = new Map(network.edgeRows.map((e) => [e.id, e]));
  const codeById = new Map(network.portRows.map((p) => [p.id, p.code]));
  const graph = buildNetworkGraph(network, engine);

  const targetLabel = (effect) => {
    if (effect.portId) return portById.get(effect.portId)?.name ?? 'Unknown port';
    const edge = edgeById.get(effect.edgeId);
    const name = (id) => portById.get(id)?.name ?? '?';
    return edge
      ? `${name(edge.source_port_id)} to ${name(edge.destination_port_id)}`
      : 'Unknown lane';
  };
  const portView = (id) => {
    const p = portById.get(id);
    return p ? { code: p.code, name: p.name } : null;
  };

  const affectedIds = new Set();
  for (const scenario of usedScenarios) {
    const crisis = {
      scenarioId: scenario.id,
      name: scenario.name,
      effects: scenario.effects.map((e) => ({
        type: e.type,
        kind: e.portId ? 'port' : 'lane',
        target: targetLabel(e),
      })),
      affected: [],
    };
    let core;
    try {
      core = toCoreEffects(scenario.effects, network, graph, engine);
    } catch (err) {
      // A scenario that no longer fits the network is skipped, not fatal.
      logger.error('crisis_overview_scenario_invalid', {
        scenarioId: scenario.id,
        reason: err?.code,
      });
      continue;
    }
    for (const shipment of usedShipments) {
      const from = codeById.get(shipment.origin_port_id);
      const to = codeById.get(shipment.destination_port_id);
      if (!from || !to) continue;
      let result;
      try {
        result = engine.simulateDisruption(graph, core, from, to, OVERVIEW_OBJECTIVE);
      } catch (err) {
        if (err instanceof engine.RoutingInputError) continue;
        throw err;
      }
      if (!AFFECTED.includes(result.status)) continue;
      affectedIds.add(shipment.id);
      crisis.affected.push({
        ...toSimulationView({
          scenarioId: scenario.id,
          shipmentId: shipment.id,
          result,
          resultId: null,
        }),
        shipmentNumber: shipment.shipment_number,
        shipmentStatus: shipment.status,
        origin: portView(shipment.origin_port_id),
        destination: portView(shipment.destination_port_id),
      });
    }
    base.crises.push(crisis);
  }
  // Crises that hit something first, then the rest, each group newest first (as listed).
  base.crises.sort((a, b) => b.affected.length - a.affected.length);
  base.affectedShipments = affectedIds.size;
  return base;
}
