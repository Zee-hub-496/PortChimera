import { AppError } from '../../middleware/errorHandler.js';
import { getShipmentRow } from '../shipments/service.js';
import { mapRowsToGraphInput } from './mapRows.js';

/**
 * Calculates a route for one of the caller's shipments. The routing engine is injected
 * (`engine` = { buildGraph, findRoute, OBJECTIVES, RoutingInputError } from @portchimera/core)
 * so this file stays testable without the workspace link. All math happens in core, on the server.
 *
 * @param {object} db req.db
 * @param {string} userId from req.auth
 * @param {{shipmentId: string, objective?: string}} input already validated
 * @param {object} engine
 */
export async function calculateRoute(db, userId, input, engine) {
  const { shipmentId, objective = 'fastest' } = input;
  const { buildGraph, findRoute, OBJECTIVES, RoutingInputError } = engine;

  if (!Object.hasOwn(OBJECTIVES, objective)) {
    throw new AppError(
      422,
      'INVALID_OBJECTIVE',
      `Unknown objective. Use one of: ${Object.keys(OBJECTIVES).join(', ')}`,
    );
  }

  const shipment = await getShipmentRow(db, userId, shipmentId);
  if (!shipment) throw new AppError(404, 'SHIPMENT_NOT_FOUND', 'Shipment not found');
  if (!shipment.origin_port_id || !shipment.destination_port_id) {
    throw new AppError(
      422,
      'SHIPMENT_HAS_NO_PORTS',
      'This shipment has no origin or destination port',
    );
  }

  const [portsRes, edgesRes] = await Promise.all([
    db.from('ports').select('id, code, name, lat, lon, data_label'),
    db
      .from('shipping_edges')
      .select(
        'id, source_port_id, destination_port_id, distance_km, transit_days, freight_cost_usd, risk_score, data_label',
      ),
  ]);
  if (portsRes.error || edgesRes.error) {
    throw new AppError(500, 'ROUTE_DATA_FAILED', 'Could not load the shipping network');
  }
  const portRows = portsRes.data ?? [];
  const codeById = new Map(portRows.map((p) => [p.id, p.code]));
  const from = codeById.get(shipment.origin_port_id);
  const to = codeById.get(shipment.destination_port_id);
  if (!from || !to) {
    throw new AppError(422, 'UNKNOWN_PORT', 'The shipment ports are not in the network');
  }

  let result;
  let graphInput;
  try {
    graphInput = mapRowsToGraphInput(portRows, edgesRes.data ?? []);
    const graph = buildGraph(graphInput.ports, graphInput.edges, {
      dataLabel: graphInput.dataLabel,
    });
    result = findRoute(graph, from, to, objective);
  } catch (err) {
    if (err instanceof RoutingInputError) {
      throw new AppError(422, 'ROUTING_INPUT_INVALID', err.message);
    }
    throw err;
  }

  const nameOf = new Map(graphInput.ports.map((p) => [p.code, p.name]));
  const base = {
    shipmentId,
    objective: result.objective,
    status: result.status,
    dataLabel: result.dataLabel ?? graphInput.dataLabel,
  };
  if (result.status !== 'found') return { ...base, reason: result.reason, path: [], totals: null };

  return {
    ...base,
    path: result.path.map((code) => ({ code, name: nameOf.get(code) ?? code })),
    totals: result.totals,
  };
}
