import { buildGraph } from './graph.js';
import { RoutingInputError } from './errors.js';

/** Port-level problems close a whole port; connection_failure closes a lane; weather may do either. */
export const DISRUPTION_TYPES = Object.freeze([
  'port_strike',
  'severe_weather',
  'port_congestion',
  'connection_failure',
]);

const PORT_ONLY = new Set(['port_strike', 'port_congestion']);
const LANE_ONLY = new Set(['connection_failure']);

/**
 * Checks disruption effects against the graph and returns clean copies.
 *
 * An effect closes exactly one thing:
 *   { type, portCode }      closes a port (and so every lane touching it)
 *   { type, from, to }      closes one DIRECTED lane. To close a connection in both directions,
 *                           list two effects (from->to and to->from).
 *
 * Unknown ports or lanes are rejected, not ignored: a scenario that silently does nothing would
 * make a simulation look safer than it is.
 */
export function validateEffects(graph, effects) {
  if (!Array.isArray(effects)) throw new RoutingInputError('effects must be an array');

  return effects.map((effect, i) => {
    const where = `Effect ${i + 1}`;
    const { type, portCode, from, to } = effect ?? {};
    if (!DISRUPTION_TYPES.includes(type)) {
      throw new RoutingInputError(
        `${where}: unknown type "${type}". Use one of: ${DISRUPTION_TYPES.join(', ')}`,
      );
    }

    const hasPort = portCode !== undefined;
    const hasLane = from !== undefined || to !== undefined;
    if (hasPort === hasLane) {
      throw new RoutingInputError(
        `${where}: give either portCode, or both from and to, not both or neither`,
      );
    }

    if (hasPort) {
      if (LANE_ONLY.has(type)) {
        throw new RoutingInputError(
          `${where}: ${type} applies to a lane (from and to), not a port`,
        );
      }
      if (!graph.ports.has(portCode))
        throw new RoutingInputError(`${where}: unknown port "${portCode}"`);
      return { type, portCode };
    }

    if (PORT_ONLY.has(type)) {
      throw new RoutingInputError(`${where}: ${type} applies to a port (portCode), not a lane`);
    }
    if (typeof from !== 'string' || typeof to !== 'string') {
      throw new RoutingInputError(`${where}: a lane needs both from and to`);
    }
    const exists = graph.adjacency.get(from)?.some((e) => e.to === to);
    if (!exists) throw new RoutingInputError(`${where}: there is no lane ${from} -> ${to}`);
    return { type, from, to };
  });
}

/**
 * Applies disruption effects and returns a NEW graph without the closed ports and lanes.
 * The input graph is never modified: that is what makes simulations private and reversible.
 *
 * @param {ReturnType<typeof buildGraph>} graph the shared graph
 * @param {Array<object>} effects see validateEffects
 * @returns {{graph: object, closedPorts: string[], closedLanes: Array<{from: string, to: string}>, effects: object[]}}
 */
export function applyDisruptions(graph, effects = []) {
  const clean = validateEffects(graph, effects);

  const closedPorts = new Set();
  const closedLaneKeys = new Set();
  for (const e of clean) {
    if (e.portCode !== undefined) closedPorts.add(e.portCode);
    else closedLaneKeys.add(`${e.from}>${e.to}`);
  }

  const ports = [...graph.ports.values()].filter((p) => !closedPorts.has(p.code));
  const edges = graph.edges.filter(
    (e) =>
      !closedPorts.has(e.from) &&
      !closedPorts.has(e.to) &&
      !closedLaneKeys.has(`${e.from}>${e.to}`),
  );

  return {
    graph: buildGraph(ports, edges, { dataLabel: graph.dataLabel }),
    closedPorts: [...closedPorts].sort(),
    closedLanes: [...closedLaneKeys].sort().map((key) => {
      const [from, to] = key.split('>');
      return { from, to };
    }),
    effects: clean,
  };
}
