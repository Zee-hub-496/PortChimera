import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { affectedRow, crisisCards, crisisSummary, effectLine } from '../src/lib/crisisView.js';

const hit = {
  scenarioId: 's1',
  shipmentId: 'sh1',
  shipmentNumber: 'SHP-1',
  status: 'rerouted',
  origin: { code: 'CNSHA', name: 'Shanghai' },
  destination: { code: 'PKKHI', name: 'Karachi' },
  baseline: { pathNames: ['Shanghai', 'Singapore', 'Karachi'] },
  disrupted: { pathNames: ['Shanghai', 'Port Klang', 'Karachi'] },
  added: { days: 2.34, costUsd: 410.4, risk: 1.26 },
};
const overview = {
  affectedShipments: 1,
  crises: [
    {
      scenarioId: 's1',
      name: 'Singapore strike',
      effects: [{ type: 'port_strike', kind: 'port', target: 'Singapore' }],
      affected: [hit],
    },
    { scenarioId: 's2', name: 'Quiet', effects: [], affected: [] },
  ],
};

describe('crisisSummary', () => {
  it('has three honest states', () => {
    assert.equal(crisisSummary(null).state, 'none_set');
    assert.equal(crisisSummary({ crises: [] }).state, 'none_set');
    const quiet = crisisSummary({ crises: [{}], affectedShipments: 0 });
    assert.equal(quiet.state, 'no_impact');
    assert.match(quiet.title, /No crisis affects any of your shipments/);
    const hot = crisisSummary(overview);
    assert.equal(hot.state, 'impact');
    assert.match(hot.title, /^1 shipment is affected$/);
    assert.match(crisisSummary({ crises: [{}], affectedShipments: 3 }).title, /3 shipments are/);
  });
});

describe('effectLine', () => {
  it('names the target and the kind of closure', () => {
    assert.equal(
      effectLine({ type: 'port_strike', kind: 'port', target: 'Singapore' }),
      'Singapore: port strike',
    );
    assert.equal(
      effectLine({ type: 'connection_failure', kind: 'lane', target: 'Shanghai to Singapore' }),
      'Lane Shanghai to Singapore: connection failure',
    );
  });
});

describe('affectedRow', () => {
  it('shows the new route and the extra time, cost and risk', () => {
    const r = affectedRow(hit);
    assert.equal(r.number, 'SHP-1');
    assert.equal(r.lane, 'Shanghai to Karachi');
    assert.equal(r.statusLabel, 'Route changed');
    assert.equal(r.before, 'Shanghai > Singapore > Karachi');
    assert.equal(r.after, 'Shanghai > Port Klang > Karachi');
    assert.deepEqual(
      r.extra.map((e) => [e.key, e.value]),
      [
        ['days', '+2.3 days'],
        ['cost', '+$410'],
        ['risk', '+1.3'],
      ],
    );
    assert.match(r.headline, /An alternative route exists/);
  });

  it('has no new route and no extras when the origin is closed', () => {
    const r = affectedRow({ ...hit, status: 'origin_closed', disrupted: null, added: null });
    assert.equal(r.after, '');
    assert.deepEqual(r.extra, []);
    assert.equal(r.tone, 'danger');
    assert.equal(r.rerouted, false);
  });
});

describe('crisisCards', () => {
  it('turns the overview into cards with readable effects and rows', () => {
    const cards = crisisCards(overview);
    assert.equal(cards.length, 2);
    assert.deepEqual(cards[0].effects, ['Singapore: port strike']);
    assert.equal(cards[0].rows.length, 1);
    assert.equal(cards[1].rows.length, 0);
    assert.deepEqual(crisisCards(null), []);
  });
});
