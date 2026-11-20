import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../src/middleware/errorHandler.js';
import { createShipment, getShipment, listShipments } from '../src/modules/shipments/service.js';
import { shipmentHandlers } from '../src/modules/shipments/handlers.js';
import { indexPorts, toShipmentView } from '../src/modules/shipments/shipmentView.js';
import { fakeDbFactory, fakeRes } from './helpers/fakes.js';
import { seedAsDbRows } from './helpers/network.js';

const { ports } = seedAsDbRows();

function setup() {
  const factory = fakeDbFactory(
    { ports, shipments: [], audit_logs: [] },
    { shared: ['ports'], unique: { shipments: ['shipment_number'] } },
  );
  return {
    factory,
    alice: factory.createDb('alice-token'),
    bob: factory.createDb('bob-token'),
  };
}

const input = (n = 'SHP-1') => ({
  shipmentNumber: n,
  originPortCode: 'CNSHA',
  destinationPortCode: 'PKKHI',
  incoterm: 'FOB',
});

const rejects = (promise, status, code) =>
  assert.rejects(promise, (e) => e instanceof AppError && e.status === status && e.code === code);

describe('shipment service', () => {
  it('creates a shipment, derives countries and returns the camelCase view', async () => {
    const { factory, alice } = setup();
    const view = await createShipment(alice, 'user-alice', input());
    assert.deepEqual(Object.keys(view).sort(), [
      'createdAt',
      'destination',
      'id',
      'incoterm',
      'origin',
      'shipmentNumber',
      'status',
    ]);
    assert.equal(view.origin.code, 'CNSHA');
    assert.equal(view.destination.code, 'PKKHI');
    assert.equal(view.status, 'submitted');
    const stored = factory.inserts.find((i) => i.table === 'shipments').row;
    assert.equal(stored.user_id, 'user-alice');
    assert.equal(stored.origin_country, 'CN');
    assert.equal(stored.destination_country, 'PK');
  });

  it('writes a shipment.created audit entry', async () => {
    const { factory, alice } = setup();
    const view = await createShipment(alice, 'user-alice', input());
    const audit = factory.inserts.find((i) => i.table === 'audit_logs');
    assert.equal(audit.row.action, 'shipment.created');
    assert.equal(audit.row.shipment_id, view.id);
    assert.equal(audit.row.user_id, 'user-alice');
  });

  it('lists only the caller shipments, newest first', async () => {
    const { alice, bob } = setup();
    await createShipment(alice, 'user-alice', input('A-1'));
    await createShipment(alice, 'user-alice', input('A-2'));
    const list = await listShipments(alice, 'user-alice');
    assert.deepEqual(
      list.map((s) => s.shipmentNumber),
      ['A-2', 'A-1'],
    );
    assert.deepEqual(await listShipments(bob, 'user-bob'), []);
  });

  it('returns null when another user asks for a shipment', async () => {
    const { alice, bob } = setup();
    const view = await createShipment(alice, 'user-alice', input());
    assert.equal((await getShipment(alice, 'user-alice', view.id)).id, view.id);
    assert.equal(await getShipment(bob, 'user-bob', view.id), null);
    assert.equal(await getShipment(alice, 'user-alice', 'missing'), null);
  });

  it('returns 409 for a duplicate shipment number, but lets another user reuse it', async () => {
    const { alice, bob } = setup();
    await createShipment(alice, 'user-alice', input());
    await rejects(createShipment(alice, 'user-alice', input()), 409, 'SHIPMENT_NUMBER_EXISTS');
    await createShipment(bob, 'user-bob', input());
  });

  it('returns 422 for an unknown port and writes nothing', async () => {
    const { factory, alice } = setup();
    await rejects(
      createShipment(alice, 'user-alice', { ...input(), destinationPortCode: 'ZZZZZ' }),
      422,
      'UNKNOWN_PORT',
    );
    assert.equal(factory.inserts.length, 0);
  });
});

describe('shipment handlers', () => {
  const parsers = { parseCreate: (b) => b, parseId: (id) => id };
  const reqFor = (db, userId, extra = {}) => ({ auth: { userId }, db, ...extra });

  it('POST creates with 201 and ignores any user id in the body', async () => {
    const { alice } = setup();
    const h = shipmentHandlers(parsers);
    const res = fakeRes();
    await h.create(reqFor(alice, 'user-alice', { body: { ...input(), userId: 'user-bob' } }), res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.data.shipmentNumber, 'SHP-1');
  });

  it('GET /:id gives 404 for another user shipment', async () => {
    const { alice, bob } = setup();
    const h = shipmentHandlers(parsers);
    const created = await createShipment(alice, 'user-alice', input());
    await rejects(
      h.get(reqFor(bob, 'user-bob', { params: { id: created.id } }), fakeRes()),
      404,
      'SHIPMENT_NOT_FOUND',
    );
    const res = fakeRes();
    await h.get(reqFor(alice, 'user-alice', { params: { id: created.id } }), res);
    assert.equal(res.body.data.id, created.id);
  });

  it('GET / lists in the {data} envelope', async () => {
    const { alice } = setup();
    const h = shipmentHandlers(parsers);
    await createShipment(alice, 'user-alice', input());
    const res = fakeRes();
    await h.list(reqFor(alice, 'user-alice'), res);
    assert.equal(res.body.data.length, 1);
  });

  it('passes parser errors through', async () => {
    const { alice } = setup();
    const h = shipmentHandlers({
      ...parsers,
      parseCreate: () => {
        throw new AppError(422, 'VALIDATION_ERROR', 'bad');
      },
    });
    await rejects(
      h.create(reqFor(alice, 'user-alice', { body: {} }), fakeRes()),
      422,
      'VALIDATION_ERROR',
    );
  });
});

describe('toShipmentView', () => {
  it('maps rows and hides user_id', () => {
    const view = toShipmentView(
      {
        id: 'x',
        user_id: 'secret',
        shipment_number: 'N',
        origin_port_id: 'p1',
        destination_port_id: 'p9',
        incoterm: null,
        status: 'submitted',
        created_at: 't',
      },
      indexPorts([{ id: 'p1', code: 'CNSHA', name: 'Shanghai', country: 'CN' }]),
    );
    assert.deepEqual(view, {
      id: 'x',
      shipmentNumber: 'N',
      origin: { code: 'CNSHA', name: 'Shanghai' },
      destination: null,
      incoterm: null,
      status: 'submitted',
      createdAt: 't',
    });
  });
});

describe('code-level ownership filter (database row security emulation off)', () => {
  const setupNoRls = () => {
    const factory = fakeDbFactory(
      { ports, shipments: [], audit_logs: [] },
      { shared: ['ports'], rls: false },
    );
    return { alice: factory.createDb('alice-token'), bob: factory.createDb('bob-token') };
  };

  it('listShipments filters on user_id in code', async () => {
    const { alice, bob } = setupNoRls();
    await createShipment(alice, 'user-alice', input('A-1'));
    assert.equal((await listShipments(alice, 'user-alice')).length, 1);
    assert.deepEqual(await listShipments(bob, 'user-bob'), []);
  });

  it('getShipment returns null for another user even if the database would return the row', async () => {
    const { alice, bob } = setupNoRls();
    const view = await createShipment(alice, 'user-alice', input());
    assert.equal(await getShipment(bob, 'user-bob', view.id), null);
    assert.equal((await getShipment(alice, 'user-alice', view.id)).id, view.id);
  });
});

describe('audit failure after insert', () => {
  it('still returns the shipment and logs the failure loudly', async () => {
    const { factory, alice } = setup();
    const logged = [];
    const logger = { error: (...a) => logged.push(a) };
    // Let the port lookup and insert pass, then fail only the audit insert.
    const failing = {
      from(table) {
        if (table === 'audit_logs') {
          return { insert: async () => ({ error: { code: 'XX000', message: 'down' } }) };
        }
        return alice.from(table);
      },
    };
    const view = await createShipment(failing, 'user-alice', input(), logger);
    assert.equal(view.shipmentNumber, 'SHP-1');
    assert.equal(logged.length, 1);
    assert.equal(logged[0][0], 'audit_write_failed');
    assert.equal(factory.inserts.filter((i) => i.table === 'shipments').length, 1);
  });
});
