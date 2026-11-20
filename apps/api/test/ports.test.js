import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { list } from '../src/modules/ports/handlers.js';
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
      'name',
    ]);
    assert.equal(res.body.data[0].dataLabel, 'illustrative');
  });
});
