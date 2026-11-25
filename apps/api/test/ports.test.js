import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { list, network } from '../src/modules/ports/handlers.js';
import { fakeDbFactory, fakeRes } from './helpers/fakes.js';
import { seedAsDbRows } from './helpers/network.js';

describe('GET /api/ports handler', () => {
  it('returns every port in camelCase for any signed-in user', async () => {
    const { ports } = seedAsDbRows();
    const factory = fakeDbFactory({ ports }, { shared: ['ports'] });
    const res = fakeRes();
    await list({ db: factory.createDb('bob-token'), auth: { userId: 'user-bob' } }, res);
    assert.equal(res.body.data.length, ports.length);
    assert.deepEqual(Object.keys(res.body.data[0]).sort(), [
      'code',
      'country',
      'dataLabel',
      'lat',
      'lon',
      'name',
    ]);
    assert.equal(res.body.data[0].dataLabel, 'illustrative');
  });
});

describe('GET /api/ports/network handler', () => {
  const setup = () => {
    const { ports, edges } = seedAsDbRows();
    const factory = fakeDbFactory(
      { ports, shipping_edges: edges },
      { shared: ['ports', 'shipping_edges'] },
    );
    return { ports, edges, db: factory.createDb('bob-token'), factory };
  };

  it('returns ports and lanes with ids, and lane ends as port codes', async () => {
    const { ports, edges, db } = setup();
    const res = fakeRes();
    await network({ db, auth: { userId: 'user-bob' } }, res);
    const { ports: outPorts, lanes } = res.body.data;
    assert.equal(outPorts.length, ports.length);
    assert.equal(lanes.length, edges.length);
    assert.deepEqual(Object.keys(outPorts[0]).sort(), [
      'code',
      'country',
      'id',
      'lat',
      'lon',
      'name',
    ]);
    assert.deepEqual(Object.keys(lanes[0]).sort(), [
      'distanceKm',
      'freightCostUsd',
      'from',
      'id',
      'riskScore',
      'to',
      'transitDays',
    ]);
    assert.match(lanes[0].from, /^[A-Z]{5}$/);
    const first = edges[0];
    assert.ok(lanes.some((l) => l.id === first.id));
  });

  it('only reads: it writes nothing to the shared tables', async () => {
    const { db, factory } = setup();
    await network({ db, auth: { userId: 'user-bob' } }, fakeRes());
    assert.deepEqual(factory.inserts, []);
    assert.deepEqual(factory.updates, []);
    assert.deepEqual(factory.deletes, []);
  });
});
