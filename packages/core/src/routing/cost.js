import { RoutingInputError } from './errors.js';

/**
 * Named objectives. Each is a set of weights (alpha for time, beta for cost, gamma for risk).
 * "Fastest" does not ignore cost and risk entirely: a small weight on them breaks ties
 * sensibly (between two equally fast routes, prefer the cheaper and safer one).
 */
export const OBJECTIVES = Object.freeze({
  fastest: Object.freeze({ time: 0.8, cost: 0.1, risk: 0.1 }),
  cheapest: Object.freeze({ time: 0.1, cost: 0.8, risk: 0.1 }),
  lowest_risk: Object.freeze({ time: 0.1, cost: 0.1, risk: 0.8 }),
});

/**
 * Accepts an objective name ('fastest') or a custom weights object and returns both
 * the objective label and validated weights.
 *
 * @param {string | {time: number, cost: number, risk: number}} objectiveOrWeights
 */
export function resolveObjective(objectiveOrWeights) {
  if (typeof objectiveOrWeights === 'string') {
    const weights = OBJECTIVES[objectiveOrWeights];
    if (!weights) {
      throw new RoutingInputError(
        `Unknown objective "${objectiveOrWeights}". Use one of: ${Object.keys(OBJECTIVES).join(', ')}`,
      );
    }
    return { objective: objectiveOrWeights, weights };
  }
  return { objective: 'custom', weights: validateWeights(objectiveOrWeights) };
}

export function validateWeights(weights) {
  const { time, cost, risk } = weights ?? {};
  for (const [name, value] of [
    ['time', time],
    ['cost', cost],
    ['risk', risk],
  ]) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new RoutingInputError(`Weight "${name}" must be a number that is zero or more`);
    }
  }
  if (time + cost + risk === 0) {
    throw new RoutingInputError('At least one weight must be greater than zero');
  }
  return Object.freeze({ time, cost, risk });
}

/**
 * Builds the edge cost function:  cost = alpha*T + beta*F + gamma*R
 * where T, F and R are the edge's days, dollars and risk divided by the largest value of
 * that attribute in the graph (so each lies between 0 and 1).
 *
 * `scale` is passed in rather than computed here on purpose. When a disruption removes
 * edges, the baseline and the disrupted route must be measured with the SAME scale,
 * otherwise their costs would not be comparable.
 *
 * @param {{time: number, cost: number, risk: number}} weights
 * @param {{transitDays: number, freightCostUsd: number, riskScore: number}} scale
 * @returns {(edge: object) => number}
 */
export function makeCostFunction(weights, scale) {
  const w = validateWeights(weights);
  // If an attribute is zero everywhere (say, all risks are 0), it adds nothing to any route.
  const part = (value, max) => (max > 0 ? value / max : 0);
  return (edge) =>
    w.time * part(edge.transitDays, scale.transitDays) +
    w.cost * part(edge.freightCostUsd, scale.freightCostUsd) +
    w.risk * part(edge.riskScore, scale.riskScore);
}
