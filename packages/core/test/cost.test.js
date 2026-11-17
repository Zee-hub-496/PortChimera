import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OBJECTIVES,
  RoutingInputError,
  makeCostFunction,
  resolveObjective,
  validateWeights,
} from '../src/index.js';

const scale = { transitDays: 10, freightCostUsd: 2000, riskScore: 0.5 };
const approx = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} is not close to ${b}`);

describe('validateWeights', () => {
  it('accepts valid weights, including zeros', () => {
    assert.deepEqual(
      { ...validateWeights({ time: 1, cost: 0, risk: 0 }) },
      { time: 1, cost: 0, risk: 0 },
    );
  });

  it('rejects negative, non-numeric, missing and all-zero weights', () => {
    for (const bad of [
      { time: -1, cost: 1, risk: 1 },
      { time: 'a', cost: 1, risk: 1 },
      { time: NaN, cost: 1, risk: 1 },
      { time: Infinity, cost: 1, risk: 1 },
      { cost: 1, risk: 1 },
      { time: 0, cost: 0, risk: 0 },
      null,
      undefined,
    ]) {
      assert.throws(() => validateWeights(bad), RoutingInputError, JSON.stringify(bad));
    }
  });
});

describe('resolveObjective', () => {
  it('resolves each named objective', () => {
    for (const name of Object.keys(OBJECTIVES)) {
      const r = resolveObjective(name);
      assert.equal(r.objective, name);
      assert.deepEqual(r.weights, OBJECTIVES[name]);
    }
  });

  it('labels custom weights as custom', () => {
    assert.equal(resolveObjective({ time: 1, cost: 2, risk: 3 }).objective, 'custom');
  });

  it('rejects an unknown objective name', () => {
    assert.throws(() => resolveObjective('shortest'), /Unknown objective/);
  });
});

describe('makeCostFunction', () => {
  const edge = { transitDays: 5, freightCostUsd: 1000, riskScore: 0.25 };

  it('normalizes each attribute by its maximum before weighting', () => {
    // each normalized value is 0.5, so cost = 0.5 * (sum of weights)
    approx(makeCostFunction({ time: 1, cost: 1, risk: 1 }, scale)(edge), 1.5);
    approx(makeCostFunction({ time: 2, cost: 0, risk: 0 }, scale)(edge), 1);
  });

  it('gives an edge at the maximum of every attribute a cost equal to the weight sum', () => {
    const maxEdge = { transitDays: 10, freightCostUsd: 2000, riskScore: 0.5 };
    approx(makeCostFunction({ time: 0.2, cost: 0.3, risk: 0.5 }, scale)(maxEdge), 1);
  });

  it('keeps the three attributes comparable: dollars do not swamp days', () => {
    const costOnly = makeCostFunction({ time: 0, cost: 1, risk: 0 }, scale)(edge);
    const timeOnly = makeCostFunction({ time: 1, cost: 0, risk: 0 }, scale)(edge);
    approx(costOnly, timeOnly);
  });

  it('treats an attribute that is zero everywhere as contributing nothing', () => {
    const zeroRiskScale = { ...scale, riskScore: 0 };
    const cost = makeCostFunction({ time: 0, cost: 0, risk: 1 }, zeroRiskScale);
    assert.equal(cost({ ...edge, riskScore: 0 }), 0);
  });

  it('rejects invalid weights up front', () => {
    assert.throws(() => makeCostFunction({ time: 0, cost: 0, risk: 0 }, scale), RoutingInputError);
  });
});
