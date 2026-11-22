import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../../../packages/core/src/index.js';
import { AppError } from '../src/middleware/errorHandler.js';
import { crossCheckHandlers } from '../src/modules/crosscheck/handlers.js';
import { markProcessing } from '../src/modules/documents/service.js';
import { syncShipmentStatus } from '../src/modules/shipments/statusSync.js';
import { fakeDbFactory, fakeRes } from './helpers/fakes.js';
import { demoRows } from './helpers/crosscheckPayloads.js';

const T0 = '2026-01-01T10:00:00.000Z'; // safely before any real cross-check time
const silent = { error() {}, warn() {}, log() {} };
const parseId = (v) => {
  if (typeof v !== 'string' || v === '') throw new AppError(422, 'VALIDATION_ERROR', 'bad id');
  return v;
};
const parseDecision = (b) => b;

function setup() {
  const tables = {
    shipments: [],
    documents: [],
    document_extractions: [],
    discrepancies: [],
    audit_logs: [],
  };
  const factory = fakeDbFactory(tables, {
    unique: { discrepancies: ['shipment_id', 'finding_key'] },
  });
  const h = crossCheckHandlers({ parseId, parseDecision, engine: core, logger: silent });
  return {
    tables,
    factory,
    h,
    alice: factory.createDb('alice-token'),
    bob: factory.createDb('bob-token'),
  };
}

/** A shipment whose three documents are approved (status 'reviewed', reviewed_at before any check). */
async function approvedShipment(t, rows) {
  const { data: shipment } = await t.alice
    .from('shipments')
    .insert({ user_id: 'user-alice', shipment_number: 'SHP-1' })
    .select()
    .single();
  for (const row of rows) {
    const { data: doc } = await t.alice
      .from('documents')
      .insert({ shipment_id: shipment.id, document_type: row.document_type })
      .select()
      .single();
    t.tables.documents.find((d) => d.id === doc.id).processing_status = 'reviewed';
    await t.alice.from('document_extractions').insert({
      document_id: doc.id,
      payload: row.reviewed_payload,
      reviewed_payload: row.reviewed_payload,
      reviewed_at: T0,
    });
  }
  return shipment.id;
}

const status = (t, id) => t.tables.shipments.find((s) => s.id === id).status;
const statusChanges = (t) =>
  t.tables.audit_logs.filter((a) => a.action === 'shipment.status_changed').map((a) => a.details);
const asAlice = (extra = {}) => ({
  db: null,
  auth: { userId: 'user-alice' },
  params: {},
  body: {},
  ...extra,
});
async function call(t, fn, params, body = {}) {
  const res = fakeRes();
  await fn({ ...asAlice({ params, body }), db: t.alice }, res);
  return res;
}

describe('syncShipmentStatus', () => {
  it('leaves a new shipment as submitted and writes nothing', async () => {
    const t = setup();
    const { data } = await t.alice
      .from('shipments')
      .insert({ user_id: 'user-alice', shipment_number: 'SHP-1' })
      .select()
      .single();
    assert.equal(await syncShipmentStatus(t.alice, 'user-alice', data.id, silent), 'submitted');
    assert.equal(t.factory.updates.length, 0);
    assert.deepEqual(statusChanges(t), []);
  });

  it('moves to ai_processing when a document starts processing, and audits the change', async () => {
    const t = setup();
    const { data: shipment } = await t.alice
      .from('shipments')
      .insert({ user_id: 'user-alice', shipment_number: 'SHP-1' })
      .select()
      .single();
    const { data: doc } = await t.alice
      .from('documents')
      .insert({ shipment_id: shipment.id, document_type: 'commercial_invoice' })
      .select()
      .single();
    await markProcessing(t.alice, 'user-alice', doc.id, silent);
    assert.equal(status(t, shipment.id), 'ai_processing');
    assert.deepEqual(statusChanges(t), [{ from: 'submitted', to: 'ai_processing' }]);
  });

  it('goes to requires_review when documents are approved but no cross-check has run', async () => {
    const t = setup();
    const id = await approvedShipment(t, demoRows());
    assert.equal(await syncShipmentStatus(t.alice, 'user-alice', id, silent), 'requires_review');
    assert.equal(status(t, id), 'requires_review');
  });

  it('mismatch: requires_review after the cross-check, ai_pre_cleared once the finding is decided', async () => {
    const t = setup();
    const id = await approvedShipment(t, demoRows({ packingGross: '650 kg' }));
    const ran = await call(t, t.h.run, { shipmentId: id });
    assert.equal(ran.body.data.discrepancies.length, 1);
    assert.equal(status(t, id), 'requires_review');

    const findingId = t.tables.discrepancies[0].id;
    await call(t, t.h.decide, { id: findingId }, { review_status: 'resolved' });
    assert.equal(status(t, id), 'ai_pre_cleared');
  });

  it('consistent documents go straight to ai_pre_cleared after the cross-check', async () => {
    const t = setup();
    const id = await approvedShipment(t, demoRows());
    await call(t, t.h.run, { shipmentId: id });
    assert.equal(status(t, id), 'ai_pre_cleared');
  });

  it('a review saved after the cross-check sends the shipment back to requires_review', async () => {
    const t = setup();
    const id = await approvedShipment(t, demoRows());
    await call(t, t.h.run, { shipmentId: id });
    assert.equal(status(t, id), 'ai_pre_cleared');

    t.tables.document_extractions[0].reviewed_at = new Date(Date.now() + 60_000).toISOString();
    await syncShipmentStatus(t.alice, 'user-alice', id, silent);
    assert.equal(status(t, id), 'requires_review');
  });

  it('a revoked approval (document back to extracted) leaves ai_pre_cleared', async () => {
    const t = setup();
    const id = await approvedShipment(t, demoRows());
    await call(t, t.h.run, { shipmentId: id });
    t.tables.documents[1].processing_status = 'extracted';
    await syncShipmentStatus(t.alice, 'user-alice', id, silent);
    assert.equal(status(t, id), 'requires_review');
  });

  it('never overwrites a status a person set (cleared)', async () => {
    const t = setup();
    const id = await approvedShipment(t, demoRows());
    t.tables.shipments[0].status = 'cleared';
    assert.equal(await syncShipmentStatus(t.alice, 'user-alice', id, silent), 'cleared');
    assert.equal(status(t, id), 'cleared');
  });

  it("does not touch another user's shipment", async () => {
    const t = setup();
    const id = await approvedShipment(t, demoRows());
    const result = await syncShipmentStatus(t.bob, 'user-bob', id, silent);
    assert.equal(result, null);
    assert.equal(status(t, id), 'submitted');
    assert.equal(t.factory.updates.length, 0);
  });

  it('logs and returns null instead of throwing when the database fails', async () => {
    const t = setup();
    const id = await approvedShipment(t, demoRows());
    const logged = [];
    t.factory.failNextWith({ code: 'XX000', message: 'boom' });
    const result = await syncShipmentStatus(t.alice, 'user-alice', id, {
      error: (name, info) => logged.push([name, info]),
    });
    assert.equal(result, null);
    assert.equal(logged[0][0], 'shipment_status_sync_failed');
    assert.deepEqual(Object.keys(logged[0][1]).sort(), ['reason', 'shipmentId', 'userId']);
  });
});
