import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEffect,
  closedTargetIds,
  compareRows,
  deltaTone,
  describeEffect,
  describeSimulation,
  impactHeadline,
  effectTypesFor,
  formatDeltaCost,
  formatDeltaDays,
  formatDeltaRisk,
  indexNetwork,
  nextScenarioName,
  overlayFor,
  STATUS_INFO,
  targetOptions,
} from '../src/lib/scenarioView.js';
import { ILLUSTRATIVE_NOTICE } from '../src/lib/routeView.js';

const network = {
  ports: [
    { id: 'p1', code: 'CNSHA', name: 'Shanghai', lat: 31.2, lon: 121.5 },
    { id: 'p2', code: 'SGSIN', name: 'Singapore', lat: 1.26, lon: 103.8 },
    { id: 'p3', code: 'MYPKG', name: 'Port Klang', lat: 3.0, lon: 101.4 },
    { id: 'p4', code: 'PKKHI', name: 'Karachi', lat: 24.8, lon: 66.98 },
  ],
  lanes: [
    { id: 'e1', from: 'CNSHA', to: 'SGSIN' },
    { id: 'e2', from: 'SGSIN', to: 'PKKHI' },
    { id: 'e3', from: 'CNSHA', to: 'MYPKG' },
  ],
};
const index = indexNetwork(network);

const rerouted = {
  status: 'rerouted',
  objective: 'fastest',
  dataLabel: 'illustrative',
  explanation: 'Singapore (port strike) lies on the route, so it was re-planned.',
  baseline: {
    path: ['CNSHA', 'SGSIN', 'PKKHI'],
    pathNames: ['Shanghai', 'Singapore', 'Karachi'],
    totals: { transitDays: 14, freightCostUsd: 1800, riskSum: 3 },
  },
  disrupted: {
    path: ['CNSHA', 'MYPKG', 'PKKHI'],
    pathNames: ['Shanghai', 'Port Klang', 'Karachi'],
    totals: { transitDays: 16.6, freightCostUsd: 2100, riskSum: 3.4 },
  },
  added: { days: 2.6, costUsd: 300, risk: 0.4 },
};

describe('effect types', () => {
  it('offers only types that fit the target, like the API', () => {
    assert.deepEqual(
      effectTypesFor('port').map((t) => t.value),
      ['port_strike', 'port_congestion', 'severe_weather'],
    );
    assert.deepEqual(
      effectTypesFor('lane').map((t) => t.value),
      ['connection_failure', 'severe_weather'],
    );
    assert.deepEqual(effectTypesFor('other'), []);
  });

  it('builds the API body for a port and for a lane', () => {
    assert.deepEqual(buildEffect('port', 'p2', 'port_strike'), {
      type: 'port_strike',
      portId: 'p2',
    });
    assert.deepEqual(buildEffect('lane', 'e1', 'connection_failure'), {
      type: 'connection_failure',
      edgeId: 'e1',
    });
  });
});

describe('describeEffect', () => {
  it('names a closed port and a closed lane', () => {
    assert.equal(
      describeEffect({ type: 'port_strike', portId: 'p2' }, index).text,
      'Singapore: port strike',
    );
    assert.equal(
      describeEffect({ type: 'connection_failure', edgeId: 'e1' }, index).text,
      'Lane Shanghai to Singapore: connection failure',
    );
  });
  it('does not break on ids it does not know', () => {
    assert.equal(describeEffect({ type: 'port_strike', portId: 'zz' }, index).name, 'Unknown port');
    assert.equal(
      describeEffect({ type: 'severe_weather', edgeId: 'zz' }, index).name,
      'Unknown lane',
    );
  });
});

describe('targetOptions', () => {
  it('puts ports on the current route first, then the rest by name', () => {
    const opts = targetOptions('port', index, ['CNSHA', 'SGSIN', 'PKKHI']);
    assert.deepEqual(
      opts.map((o) => o.label),
      ['Karachi (PKKHI)', 'Shanghai (CNSHA)', 'Singapore (SGSIN)', 'Port Klang (MYPKG)'],
    );
    assert.deepEqual(
      opts.map((o) => o.onRoute),
      [true, true, true, false],
    );
  });

  it('puts only the legs of the route first for lanes', () => {
    const opts = targetOptions('lane', index, ['CNSHA', 'SGSIN', 'PKKHI']);
    assert.deepEqual(
      opts.map((o) => o.value),
      ['e1', 'e2', 'e3'],
    );
    assert.deepEqual(
      opts.map((o) => o.onRoute),
      [true, true, false],
    );
  });

  it('leaves out what is already closed', () => {
    assert.equal(
      targetOptions('port', index, [], ['p2']).some((o) => o.value === 'p2'),
      false,
    );
    assert.equal(
      targetOptions('lane', index, [], ['e1']).some((o) => o.value === 'e1'),
      false,
    );
    assert.deepEqual(closedTargetIds([{ portId: 'p2' }, { edgeId: 'e1' }]), ['p2', 'e1']);
  });
});

describe('nextScenarioName', () => {
  it('numbers scenarios and skips taken names', () => {
    assert.equal(nextScenarioName([]), 'Scenario 1');
    assert.equal(nextScenarioName([{ name: 'Scenario 1' }]), 'Scenario 2');
    // One scenario exists but it is called "Scenario 2", so the count-based guess is taken.
    assert.equal(nextScenarioName([{ name: 'Scenario 2' }]), 'Scenario 3');
    assert.equal(nextScenarioName([{ name: 'Scenario 1' }, { name: 'Renamed' }]), 'Scenario 3');
  });
});

describe('overlayFor', () => {
  it('draws nothing without a simulation', () => {
    assert.deepEqual(overlayFor(null, [], index), {
      routes: [],
      disruptedCodes: [],
      ports: [],
      endpoints: [],
    });
  });

  it('draws the original and the rerouted route and rings the closed port', () => {
    const effects = [{ type: 'port_strike', portId: 'p2' }];
    const { routes, disruptedCodes } = overlayFor(rerouted, effects, index);
    assert.deepEqual(
      routes.map((r) => [r.id, r.tone]),
      [
        ['original', 'primary'],
        ['rerouted', 'alternative'],
      ],
    );
    assert.deepEqual(
      routes[1].stops.map((s) => s.code),
      ['CNSHA', 'MYPKG', 'PKKHI'],
    );
    assert.ok(routes[0].stops.every((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon)));
    assert.deepEqual(disruptedCodes, ['SGSIN']);
  });

  it('draws a closed lane as a blocked leg', () => {
    const { routes } = overlayFor(
      { ...rerouted, status: 'unaffected', disrupted: rerouted.baseline },
      [{ type: 'connection_failure', edgeId: 'e1' }],
      index,
    );
    const blocked = routes.find((r) => r.tone === 'blocked');
    assert.deepEqual(
      blocked.stops.map((s) => s.code),
      ['CNSHA', 'SGSIN'],
    );
    assert.equal(
      routes.some((r) => r.id === 'rerouted'),
      false,
    );
  });

  it('shows only the original route and the ring when there is no way around', () => {
    const { routes, disruptedCodes } = overlayFor(
      { status: 'no_route', baseline: rerouted.baseline, disrupted: null },
      [{ type: 'port_strike', portId: 'p4' }],
      index,
    );
    assert.deepEqual(
      routes.map((r) => r.id),
      ['original'],
    );
    assert.deepEqual(disruptedCodes, ['PKKHI']);
  });

  it('gives a pin to every stop and to a closed port that is off the route', () => {
    const { ports, endpoints } = overlayFor(
      rerouted,
      [{ type: 'port_strike', portId: 'p2' }],
      indexNetwork({
        ...network,
        ports: [...network.ports, { id: 'p9', code: 'USLAX', name: 'LA', lat: 33.7, lon: -118.2 }],
      }),
    );
    assert.deepEqual(ports.map((p) => p.code).sort(), ['CNSHA', 'MYPKG', 'PKKHI', 'SGSIN']);
    assert.deepEqual(endpoints, ['CNSHA', 'PKKHI']);
    const far = overlayFor(
      rerouted,
      [{ type: 'port_strike', portId: 'p9' }],
      indexNetwork({
        ...network,
        ports: [...network.ports, { id: 'p9', code: 'USLAX', name: 'LA', lat: 33.7, lon: -118.2 }],
      }),
    );
    assert.ok(far.ports.some((p) => p.code === 'USLAX'));
  });
});

describe('deltas', () => {
  it('signs and rounds days, dollars and risk', () => {
    assert.equal(formatDeltaDays(2.6), '+2.6 days');
    assert.equal(formatDeltaDays(-1), '-1 day');
    assert.equal(formatDeltaDays(0), 'No change');
    assert.equal(formatDeltaDays(0.04), 'No change');
    assert.equal(formatDeltaCost(1234.4), '+$1,234');
    assert.equal(formatDeltaCost(-500), '-$500');
    assert.equal(formatDeltaCost(0.2), 'No change');
    assert.equal(formatDeltaRisk(0.4), '+0.4');
    assert.equal(formatDeltaRisk(-1.25), '-1.3');
    assert.equal(formatDeltaRisk(0), 'No change');
  });

  it('treats more days, cost or risk as worse', () => {
    assert.equal(deltaTone(0.4), 'warn');
    assert.equal(deltaTone(-0.4), 'success');
    assert.equal(deltaTone(0), 'neutral');
    assert.equal(deltaTone(0.0001), 'neutral');
  });
});

describe('compareRows', () => {
  it('shows before, after and the change for time, cost and risk', () => {
    const rows = compareRows(rerouted);
    assert.deepEqual(
      rows.map((r) => r.key),
      ['days', 'cost', 'risk'],
    );
    assert.deepEqual(rows[0], {
      key: 'days',
      label: 'Transit time',
      before: '14 days',
      after: '16.6 days',
      delta: '+2.6 days',
      tone: 'warn',
    });
    assert.equal(rows[1].before, '$1,800');
    assert.equal(rows[1].after, '$2,100');
    assert.equal(rows[1].delta, '+$300');
    assert.equal(rows[2].after, '3.4');
  });

  it('is empty when there is no second route', () => {
    assert.deepEqual(
      compareRows({ status: 'no_route', baseline: rerouted.baseline, disrupted: null }),
      [],
    );
    assert.deepEqual(compareRows(null), []);
  });
});

describe('describeSimulation', () => {
  it('gives every outcome a title and tone', () => {
    for (const status of [
      'rerouted',
      'unaffected',
      'no_route',
      'origin_closed',
      'destination_closed',
      'baseline_unavailable',
    ]) {
      assert.ok(STATUS_INFO[status].title, status);
      assert.ok(['warn', 'success', 'danger', 'neutral'].includes(STATUS_INFO[status].tone));
    }
  });

  it('describes a rerouted result with the API explanation and the illustrative label', () => {
    const d = describeSimulation(rerouted);
    assert.equal(d.title, 'Route changed');
    assert.equal(d.explanation, rerouted.explanation);
    assert.equal(d.original, 'Shanghai > Singapore > Karachi');
    assert.equal(d.rerouted, 'Shanghai > Port Klang > Karachi');
    assert.equal(d.rows.length, 3);
    assert.equal(d.notice, ILLUSTRATIVE_NOTICE);
  });

  it('describes closed endpoints and unreachable routes without a comparison', () => {
    const closed = describeSimulation({
      status: 'destination_closed',
      explanation: 'No valid route exists.',
      baseline: rerouted.baseline,
      disrupted: null,
      dataLabel: 'illustrative',
    });
    assert.equal(closed.tone, 'danger');
    assert.equal(closed.title, 'Destination port closed');
    assert.deepEqual(closed.rows, []);
    assert.equal(closed.rerouted, '');
  });

  it('shows no notice when the data is not labelled illustrative, and handles no result', () => {
    assert.equal(describeSimulation({ ...rerouted, dataLabel: 'verified' }).notice, '');
    assert.equal(describeSimulation(null), null);
  });
});

describe('impactHeadline', () => {
  it('summarises a rerouted result from its existing deltas', () => {
    const h = impactHeadline({
      status: 'rerouted',
      added: { days: 2.34, costUsd: 410.4, risk: 1.26 },
    });
    assert.match(h, /^An alternative route exists\./);
    assert.match(h, /2\.3 days longer/);
    assert.match(h, /\$410 more freight cost/);
    assert.match(h, /risk score up 1\.3/);
  });

  it('says shorter, less and down for improvements, and no change for zero', () => {
    const h = impactHeadline({ status: 'rerouted', added: { days: -1, costUsd: -50, risk: -0.5 } });
    assert.match(h, /1 day shorter/);
    assert.match(h, /\$50 less freight cost/);
    assert.match(h, /risk score down 0\.5/);
    const same = impactHeadline({ status: 'rerouted', added: { days: 0, costUsd: 0, risk: 0 } });
    assert.match(
      same,
      /no change in transit time, no change in freight cost, no change in the risk score/,
    );
  });

  it('handles every other status without inventing numbers', () => {
    assert.match(impactHeadline({ status: 'unaffected' }), /none/);
    assert.match(impactHeadline({ status: 'no_route' }), /cannot be re-planned/);
    assert.match(impactHeadline({ status: 'origin_closed' }), /closed port/);
    assert.match(impactHeadline({ status: 'destination_closed' }), /closed port/);
    assert.equal(impactHeadline({ status: 'baseline_unavailable' }), '');
    assert.equal(impactHeadline(null), '');
    assert.equal(impactHeadline({ status: 'rerouted' }), 'An alternative route exists.');
  });

  it('is part of the summary view', () => {
    assert.equal(describeSimulation(rerouted).headline, impactHeadline(rerouted));
  });
});
