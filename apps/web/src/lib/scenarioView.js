// Pure display helpers for the crisis simulation screen. No React, no fetch, so node:test can run
// them. Numbers and the explanation text come from the API (core's simulateDisruption); this
// file only chooses wording, ordering and map layers.
import { formatDays, formatUsd, ILLUSTRATIVE_NOTICE } from './routeView.js';

export const EFFECT_LABELS = Object.freeze({
  port_strike: 'Port strike',
  port_congestion: 'Port congestion',
  severe_weather: 'Severe weather',
  connection_failure: 'Connection failure',
});

export const TARGET_KINDS = Object.freeze({ port: 'Port', lane: 'Lane' });

// Same rules as the API: strikes and congestion close ports, a connection failure closes a lane,
// weather can hit either.
const TYPES_BY_KIND = {
  port: ['port_strike', 'port_congestion', 'severe_weather'],
  lane: ['connection_failure', 'severe_weather'],
};

export function effectTypesFor(kind) {
  return (TYPES_BY_KIND[kind] ?? []).map((value) => ({ value, label: EFFECT_LABELS[value] }));
}

/** Lookup tables for the network returned by GET /api/ports/network. */
export function indexNetwork(network) {
  const ports = network?.ports ?? [];
  const lanes = network?.lanes ?? [];
  return {
    ports,
    lanes,
    portById: new Map(ports.map((p) => [p.id, p])),
    portByCode: new Map(ports.map((p) => [p.code, p])),
    laneById: new Map(lanes.map((l) => [l.id, l])),
  };
}

const portName = (index, code) => index.portByCode.get(code)?.name ?? code;

export function laneLabel(lane, index) {
  return `${portName(index, lane.from)} to ${portName(index, lane.to)}`;
}

/** One closed port or lane as a short readable line, for the list of closures. */
export function describeEffect(effect, index) {
  const type = EFFECT_LABELS[effect.type] ?? String(effect.type);
  if (effect.portId) {
    const port = index.portById.get(effect.portId);
    const name = port ? port.name : 'Unknown port';
    return { kind: 'port', name, type, text: `${name}: ${type.toLowerCase()}` };
  }
  const lane = index.laneById.get(effect.edgeId);
  const name = lane ? laneLabel(lane, index) : 'Unknown lane';
  return { kind: 'lane', name, type, text: `Lane ${name}: ${type.toLowerCase()}` };
}

/** Port codes to map stops with coordinates. Codes without coordinates are skipped. */
export function stopsFor(codes, index) {
  return (codes ?? [])
    .map((code) => index.portByCode.get(code))
    .filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .map((p) => ({ code: p.code, name: p.name, lat: p.lat, lon: p.lon }));
}

const isLegOf = (pathCodes, from, to) =>
  (pathCodes ?? []).some((code, i) => code === from && pathCodes[i + 1] === to);

/**
 * Choices for the "what to close" menu: ports or lanes that are not already closed, those on
 * the current route first (closing one of them changes the route), then the rest by name.
 * @returns {Array<{value: string, label: string, onRoute: boolean}>}
 */
export function targetOptions(kind, index, pathCodes = [], closed = []) {
  const taken = new Set(closed);
  const items =
    kind === 'lane'
      ? index.lanes
          .filter((l) => !taken.has(l.id))
          .map((l) => ({
            value: l.id,
            label: laneLabel(l, index),
            onRoute: isLegOf(pathCodes, l.from, l.to),
          }))
      : index.ports
          .filter((p) => !taken.has(p.id))
          .map((p) => ({
            value: p.id,
            label: `${p.name} (${p.code})`,
            onRoute: (pathCodes ?? []).includes(p.code),
          }));
  return items.sort(
    (a, b) => Number(b.onRoute) - Number(a.onRoute) || a.label.localeCompare(b.label),
  );
}

/** Ids already closed in a scenario, in the form targetOptions expects. */
export function closedTargetIds(effects = []) {
  return effects.map((e) => e.portId ?? e.edgeId).filter(Boolean);
}

/** The effect body for POST /api/scenarios and POST /api/scenarios/:id/effects. */
export function buildEffect(kind, targetId, type) {
  return kind === 'lane' ? { type, edgeId: targetId } : { type, portId: targetId };
}

/** First free name like "Scenario 3". */
export function nextScenarioName(scenarios = []) {
  const names = new Set(scenarios.map((s) => s.name));
  let n = scenarios.length + 1;
  while (names.has(`Scenario ${n}`)) n += 1;
  return `Scenario ${n}`;
}

/**
 * What to draw on the map for a simulation: the original route, the rerouted one when there is
 * one, closed lanes as blocked legs and closed ports as warning rings.
 */
export function overlayFor(simulation, effects, index) {
  const routes = [];
  const disruptedCodes = [];
  if (!simulation) return { routes, disruptedCodes, ports: [], endpoints: [] };

  const original = stopsFor(simulation.baseline?.path, index);
  if (original.length >= 2) {
    routes.push({ id: 'original', stops: original, tone: 'primary', label: 'Original route' });
  }
  if (simulation.status === 'rerouted') {
    const alternative = stopsFor(simulation.disrupted?.path, index);
    if (alternative.length >= 2) {
      routes.push({ id: 'rerouted', stops: alternative, tone: 'alternative', label: 'Rerouted' });
    }
  }
  for (const effect of effects ?? []) {
    if (effect.portId) {
      const port = index.portById.get(effect.portId);
      if (port) disruptedCodes.push(port.code);
    } else if (effect.edgeId) {
      const lane = index.laneById.get(effect.edgeId);
      const stops = lane ? stopsFor([lane.from, lane.to], index) : [];
      if (stops.length === 2) {
        routes.push({
          id: `closed-${effect.edgeId}`,
          stops,
          tone: 'blocked',
          label: 'Closed lane',
        });
      }
    }
  }
  // Pins for every stop and every closed port, once each, so a closed port off the route still
  // gets its warning ring.
  const pins = new Map();
  for (const stop of routes.flatMap((r) => r.stops)) pins.set(stop.code, stop);
  for (const code of disruptedCodes) {
    const port = index.portByCode.get(code);
    if (port) pins.set(code, port);
  }
  const endpoints =
    original.length > 0 ? [original[0].code, original[original.length - 1].code] : [];
  return { routes, disruptedCodes, ports: [...pins.values()], endpoints };
}

// ---------------------------------------------------------------------------------------------
// Result wording
// ---------------------------------------------------------------------------------------------

export const STATUS_INFO = Object.freeze({
  rerouted: { tone: 'warn', title: 'Route changed' },
  unaffected: { tone: 'success', title: 'Route not affected' },
  no_route: { tone: 'danger', title: 'No alternative route' },
  origin_closed: { tone: 'danger', title: 'Origin port closed' },
  destination_closed: { tone: 'danger', title: 'Destination port closed' },
  baseline_unavailable: { tone: 'neutral', title: 'No original route' },
});

const NEAR_ZERO = 0.0005;

/** Higher days, cost and risk are all worse. */
export function deltaTone(n) {
  if (n > NEAR_ZERO) return 'warn';
  if (n < -NEAR_ZERO) return 'success';
  return 'neutral';
}

const trimmed = (n, digits) => Number(Math.abs(n).toFixed(digits));
const sign = (n) => (n > 0 ? '+' : '-');

export function formatDeltaDays(n) {
  const v = trimmed(n, 1);
  if (v === 0) return 'No change';
  return `${sign(n)}${v} ${v === 1 ? 'day' : 'days'}`;
}

export function formatDeltaCost(n) {
  const v = Math.round(Math.abs(n));
  if (v === 0) return 'No change';
  return `${sign(n)}${formatUsd(v)}`;
}

export function formatDeltaRisk(n) {
  const v = trimmed(n, 1);
  if (v === 0) return 'No change';
  return `${sign(n)}${v.toFixed(1)}`;
}

/** Before and after rows for the comparison table. Empty when there is no second route. */
export function compareRows(simulation) {
  const { baseline, disrupted, added } = simulation ?? {};
  if (!baseline || !disrupted || !added) return [];
  const b = baseline.totals;
  const d = disrupted.totals;
  return [
    {
      key: 'days',
      label: 'Transit time',
      before: formatDays(b.transitDays),
      after: formatDays(d.transitDays),
      delta: formatDeltaDays(added.days),
      tone: deltaTone(added.days),
    },
    {
      key: 'cost',
      label: 'Freight cost',
      before: formatUsd(b.freightCostUsd),
      after: formatUsd(d.freightCostUsd),
      delta: formatDeltaCost(added.costUsd),
      tone: deltaTone(added.costUsd),
    },
    {
      key: 'risk',
      label: 'Risk (total)',
      before: Number(b.riskSum).toFixed(1),
      after: Number(d.riskSum).toFixed(1),
      delta: formatDeltaRisk(added.risk),
      tone: deltaTone(added.risk),
    },
  ];
}

/** Everything the summary card shows, from one API simulation result. */
export function describeSimulation(simulation) {
  if (!simulation) return null;
  const info = STATUS_INFO[simulation.status] ?? { tone: 'neutral', title: 'Result' };
  return {
    tone: info.tone,
    title: info.title,
    explanation: simulation.explanation ?? '',
    rows: compareRows(simulation),
    original: simulation.baseline?.pathNames?.join(' > ') ?? '',
    rerouted: simulation.status === 'rerouted' ? simulation.disrupted.pathNames.join(' > ') : '',
    notice: simulation.dataLabel === 'illustrative' ? ILLUSTRATIVE_NOTICE : '',
  };
}
