import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { listAllDocuments } from '../src/modules/documents/service.js';
import { listAllDiscrepancies } from '../src/modules/crosscheck/service.js';
import { fakeDbFactory } from './helpers/fakes.js';

async function setup() {
  const tables = { shipments: [], documents: [], discrepancies: [] };
  const f = fakeDbFactory(tables);
  const alice = f.createDb('alice-token');
  const bob = f.createDb('bob-token');
  const ship = async (db, uid, n) =>
    (await db.from('shipments').insert({ user_id: uid, shipment_number: n }).select().single())
      .data;
  const a1 = await ship(alice, 'user-alice', 'A-1');
  const a2 = await ship(alice, 'user-alice', 'A-2');
  const b1 = await ship(bob, 'user-bob', 'B-1');
  for (const [db, s, type] of [
    [alice, a1, 'commercial_invoice'],
    [alice, a2, 'packing_list'],
    [bob, b1, 'commercial_invoice'],
  ]) {
    await db
      .from('documents')
      .insert({ shipment_id: s.id, document_type: type, storage_path: `p/${s.id}/${type}` });
    await db
      .from('discrepancies')
      .insert({ shipment_id: s.id, field_name: 'grossWeight', document_values: { [type]: 1 } });
  }
  return { alice, bob, tables };
}

describe('list all documents and findings', () => {
  it('returns only my rows, each with its shipment number, and no storage path', async () => {
    const { alice, bob } = await setup();
    const docs = await listAllDocuments(alice, 'user-alice');
    assert.deepEqual(docs.map((d) => d.shipmentNumber).sort(), ['A-1', 'A-2']);
    assert.ok(docs.every((d) => !('storagePath' in d) && !('storage_path' in d)));
    const mine = await listAllDocuments(bob, 'user-bob');
    assert.deepEqual(
      mine.map((d) => d.shipmentNumber),
      ['B-1'],
    );
    const findings = await listAllDiscrepancies(alice, 'user-alice');
    assert.deepEqual(findings.map((f) => f.shipmentNumber).sort(), ['A-1', 'A-2']);
  });

  it('returns an empty list when there are no shipments', async () => {
    const f = fakeDbFactory({ shipments: [], documents: [], discrepancies: [] });
    const db = f.createDb('alice-token');
    assert.deepEqual(await listAllDocuments(db, 'user-alice'), []);
    assert.deepEqual(await listAllDiscrepancies(db, 'user-alice'), []);
  });

  it('does not show another user even if the code filter is bypassed (RLS)', async () => {
    const { alice } = await setup();
    const docs = await listAllDocuments(alice, 'user-bob'); // wrong id passed on purpose
    assert.deepEqual(docs, []);
  });
});
