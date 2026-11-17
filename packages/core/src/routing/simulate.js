import { findRoute } from './astar.js';
import { applyDisruptions } from './disruptions.js';
import { resolveObjective } from './cost.js';

const round6 = (n) => Math.round(n * 1e6) / 1e6;

const TYPE_LABEL = {
  port_strike: 'port strike',
  severe_weather: 'severe weather',
  port_congestion: 'port congestion',
  connection_failure: 'connection failure',
};

const OBJECTIVE_LABEL = {
  fastest: 'fastest',
  cheapest: 'cheapest',
  lowest_risk: 'lowest-risk',
  custom: 'custom-weighted',
};

// Wording helpers: turn a signed difference into "2.6 more days", "5 fewer days", etc.
const usd = (n) => `$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;

function timeDelta(n) {
  const amount = Number(Math.abs(n).toFixed(1));
  if (n > 0) return `${amount} more day${amount === 1 ? '' : 's'}`;
  if (n < 0) return `${amount} fewer day${amount === 1 ? '' : 's'}`;
  return 'the same number of days';
}

function costDelta(n) {
  if (n > 0) return `${usd(n)} more`;
  if (n < 0) return `${usd(n)} less`;
  return 'the same';
}

function summarize(graph, route) {
  return {
    path: route.path,
    pathNames: route.path.map((code) => graph.ports.get(code).name),
    totals: route.totals,
    cost: route.cost,
  };
}

/**
 * Re-plans a route under a disruption scenario and compares it with the undisturbed route.
 *
 * Steps:
 *  1. Find the baseline route on the untouched graph.
 *  2. Build a disrupted COPY of the graph (the original is never changed).
 *  3. Decide what happened: unaffected, rerouted, no alternative, or origin/destination closed.
 *  4. Measure the difference in days, dollars and risk, and explain it in plain words.
 *
 * Both routes are costed with the ORIGINAL graph's normalization scale, so their costs are
 * directly comparable even though the disrupted graph has fewer lanes.
 *
 * Statuses: unaffected | rerouted | no_route | origin_closed | destination_closed | baseline_unavailable
 *
 * @param {object} graph graph from buildGraph
 * @param {Array<object>} effects disruption effects (see validateEffects)
 * @param {string} from origin port code
 * @param {string} to destination port code
 * @param {string | {time: number, cost: number, risk: number}} [objectiveOrWeights]
 */
export function simulateDisruption(graph, effects, from, to, objectiveOrWeights = 'fastest') {
  const { objective, weights } = resolveObjective(objectiveOrWeights);
  const options = { scale: graph.maxima };

  const baselineRoute = findRoute(graph, from, to, weights, options);
  const applied = applyDisruptions(graph, effects);

  const typeOfPort = new Map();
  const typeOfLane = new Map();
  for (const e of applied.effects) {
    if (e.portCode !== undefined) typeOfPort.set(e.portCode, typeOfPort.get(e.portCode) ?? e.type);
    else typeOfLane.set(`${e.from}>${e.to}`, typeOfLane.get(`${e.from}>${e.to}`) ?? e.type);
  }
  const name = (code) => graph.ports.get(code).name;
  const closed = {
    ports: applied.closedPorts.map((code) => ({
      code,
      name: name(code),
      type: typeOfPort.get(code),
    })),
    lanes: applied.closedLanes.map(({ from: a, to: b }) => ({
      from: a,
      to: b,
      type: typeOfLane.get(`${a}>${b}`),
    })),
  };

  const result = {
    objective,
    weights,
    dataLabel: graph.dataLabel,
    closed,
    baselineRoute,
    disruptedRoute: null,
    baseline: baselineRoute.status === 'found' ? summarize(graph, baselineRoute) : null,
    disrupted: null,
    added: null,
    changedPorts: null,
  };

  const describeClosed = (ports, lanes) =>
    [
      ...ports.map((p) => `${p.name} (${TYPE_LABEL[p.type]})`),
      ...lanes.map((l) => `the lane ${name(l.from)} to ${name(l.to)} (${TYPE_LABEL[l.type]})`),
    ].join(' and ');
  const routeLabel = `${OBJECTIVE_LABEL[objective]} route from ${name(from)} to ${name(to)}`;
  const illustrative = graph.dataLabel === 'illustrative' ? ' All figures are illustrative.' : '';

  // The origin or destination itself is closed: no search can help.
  const closedEnds = closed.ports.filter((p) => p.code === from || p.code === to);
  if (closedEnds.length > 0) {
    const originClosed = closedEnds.some((p) => p.code === from);
    const destinationClosed = closedEnds.some((p) => p.code === to);
    const which = [originClosed ? 'origin' : null, destinationClosed ? 'destination' : null]
      .filter(Boolean)
      .join(' and ');
    return {
      ...result,
      status: originClosed ? 'origin_closed' : 'destination_closed',
      explanation:
        `No valid route exists. The ${which} port is closed: ${describeClosed(closedEnds, [])}. ` +
        'A shipment cannot start from or be delivered to a closed port until it reopens.',
    };
  }

  if (baselineRoute.status !== 'found') {
    return {
      ...result,
      status: 'baseline_unavailable',
      explanation: `No route from ${name(from)} to ${name(to)} existed even before the disruption, so there is nothing to compare.`,
    };
  }

  // Which closed elements does the baseline route actually use?
  const usedPorts = closed.ports.filter((p) => baselineRoute.path.includes(p.code));
  const usedLanes = closed.lanes.filter((l) =>
    baselineRoute.edges.some((e) => e.from === l.from && e.to === l.to),
  );

  if (usedPorts.length === 0 && usedLanes.length === 0) {
    return {
      ...result,
      status: 'unaffected',
      disruptedRoute: baselineRoute,
      disrupted: result.baseline,
      added: { days: 0, costUsd: 0, risk: 0 },
      changedPorts: { dropped: [], added: [] },
      explanation:
        `The disruption (${describeClosed(closed.ports, closed.lanes) || 'nothing closed'}) does not touch the ` +
        `${routeLabel} (${result.baseline.pathNames.join(' > ')}). The route is unchanged.`,
    };
  }

  const disruptedRoute = findRoute(applied.graph, from, to, weights, options);
  const described = describeClosed(usedPorts, usedLanes);
  const touched = described.charAt(0).toUpperCase() + described.slice(1); // starts a sentence

  if (disruptedRoute.status !== 'found') {
    return {
      ...result,
      status: 'no_route',
      disruptedRoute,
      explanation:
        `${touched} lies on the ${routeLabel}, and no alternative route exists with the remaining ports and lanes. ` +
        'The shipment needs manual re-planning or a wait until service resumes.',
    };
  }

  const disrupted = summarize(graph, disruptedRoute);
  const added = {
    days: round6(disruptedRoute.totals.transitDays - baselineRoute.totals.transitDays),
    costUsd: round6(disruptedRoute.totals.freightCostUsd - baselineRoute.totals.freightCostUsd),
    risk: round6(disruptedRoute.totals.riskSum - baselineRoute.totals.riskSum),
  };
  const changedPorts = {
    dropped: baselineRoute.path.filter((c) => !disruptedRoute.path.includes(c)),
    added: disruptedRoute.path.filter((c) => !baselineRoute.path.includes(c)),
  };

  return {
    ...result,
    status: 'rerouted',
    disruptedRoute,
    disrupted,
    added,
    changedPorts,
    explanation:
      `${touched} lies on the ${routeLabel} (${result.baseline.pathNames.join(' > ')}), so the route was re-planned: ` +
      `${disrupted.pathNames.join(' > ')}. The new route takes ${timeDelta(added.days)}` +
      ` and costs ${costDelta(added.costUsd)} in freight` +
      `${added.risk > 0 ? ', with a higher risk score' : added.risk < 0 ? ', with a lower risk score' : ''}.${illustrative}`,
  };
}
