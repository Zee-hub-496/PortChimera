import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../../../../packages/core/src/index.js';
import { AppError } from '../../src/middleware/errorHandler.js';
import { crossCheckHandlers } from '../../src/modules/crosscheck/handlers.js';
import { fakeDbFactory, fakeRes } from '../helpers/fakes.js';
import { demoRows } from '../helpers/crosscheckPayloads.js';

const silent = { error() {}, warn() {}, log() {} };
const parseId = (v) => {
  if (typeof v !== 'string' || v === '') throw new AppError(422, 'VALIDATION_ERROR', 'bad id');
  return v;
};
const parseDecision = (b) => {
  if (!['accepted', 'resolved', 'dismissed'].includes(b?.review_status)) {
    throw new AppError(422, 'VALIDATION_ERROR', 'bad decision');
  }
  return b;
};

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
  const alice = factory.createDb('alice-token');
  const bob = factory.createDb('bob-token');
  const req = (db, userId, extra = {}) => ({
    db,
    auth: { userId },
    params: {},
    body: {},
    ...extra,
  });
  return {
    tables,
    factory,
    h,
    alice,
    bob,
    asAlice: (e) => req(alice, 'user-alice', e),
    asBob: (e) => req(bob, 'user-bob', e),
  };
}

async function shipmentWithDocs(db, userId, rows, { reviewed = true } = {}) {
  const { data: shipment } = await db
    .from('shipments')
    .insert({ user_id: userId, shipment_number: 'SHP-1' })
    .select()
    .single();
  for (const row of rows) {
    const { data: doc } = await db
      .from('documents')
      .insert({ shipment_id: shipment.id, document_type: row.document_type })
      .select()
      .single();
    await db.from('document_extractions').insert({
      document_id: doc.id,
      payload: row.reviewed_payload,
      reviewed_payload: reviewed ? row.reviewed_payload : null,
    });
  }
  return shipment.id;
}

const call = async (fn, req) => {
  const res = fakeRes();
  await fn(req, res);
  return res;
};
const run = (t, req, id) => call(t.h.run, { ...req, params: { shipmentId: id } });
const list = (t, req, id) => call(t.h.list, { ...req, params: { shipmentId: id } });
const decide = (t, req, id, status) =>
  call(t.h.decide, { ...req, params: { id }, body: { review_status: status } });
const actions = (t) => t.tables.audit_logs.map((a) => a.action);

describe('POST /shipments/:id/cross-check', () => {
  it('stores one high weight finding for the demo mismatch and a summary', async () => {
    const t = setup();
    const id = await shipmentWithDocs(t.alice, 'user-alice', demoRows({ packingGross: '650 kg' }));
    const res = await run(t, t.asAlice(), id);
    assert.equal(res.statusCode, 200);
    const { discrepancies, summary } = res.body.data;
    assert.equal(discrepancies.length, 1);
    assert.equal(discrepancies[0].field, 'grossWeight');
    assert.equal(discrepancies[0].severity, 'high');
    assert.equal(discrepancies[0].reviewStatus, 'open');
    assert.deepEqual(discrepancies[0].values, {
      commercial_invoice: '500 kg',
      packing_list: '650 kg',
    });
    assert.equal(summary.overall, 'high');
    assert.equal(t.tables.discrepancies.length, 1);
    assert.equal(
      t.tables.discrepancies[0].finding_key,
      'grossWeight|commercial_invoice+packing_list',
    );
    assert.deepEqual(actions(t), ['crosscheck.run']);
  });

  it('stores nothing for the consistent set', async () => {
    const t = setup();
    const id = await shipmentWithDocs(t.alice, 'user-alice', demoRows());
    const res = await run(t, t.asAlice(), id);
    assert.deepEqual(res.body.data.discrepancies, []);
    assert.equal(res.body.data.summary.overall, 'consistent');
  });

  it('answers 409 with fewer than two reviewed documents', async () => {
    const t = setup();
    const id = await shipmentWithDocs(t.alice, 'user-alice', demoRows(), { reviewed: false });
    await assert.rejects(run(t, t.asAlice(), id), (e) => e.status === 409);
    const one = await shipmentWithDocs(t.alice, 'user-alice', demoRows().slice(0, 1));
    await assert.rejects(
      run(t, t.asAlice(), one),
      (e) => e.code === 'NOT_ENOUGH_REVIEWED_DOCUMENTS',
    );
    assert.equal(t.tables.discrepancies.length, 0);
    assert.deepEqual(actions(t), []);
  });

  it('is owner only: Bob gets 404 and nothing is written', async () => {
    const t = setup();
    const id = await shipmentWithDocs(t.alice, 'user-alice', demoRows({ packingGross: '650 kg' }));
    await assert.rejects(
      run(t, t.asBob(), id),
      (e) => e.status === 404 && e.code === 'SHIPMENT_NOT_FOUND',
    );
    await assert.rejects(list(t, t.asBob(), id), (e) => e.status === 404);
    assert.equal(t.tables.discrepancies.length, 0);
  });

  it('is owner only even when row level security is off (code-level check)', async () => {
    const tables = {
      shipments: [],
      documents: [],
      document_extractions: [],
      discrepancies: [],
      audit_logs: [],
    };
    const factory = fakeDbFactory(tables, { rls: false });
    const h = crossCheckHandlers({ parseId, parseDecision, engine: core, logger: silent });
    const alice = factory.createDb('alice-token');
    const id = await shipmentWithDocs(alice, 'user-alice', demoRows({ packingGross: '650 kg' }));
    const req = {
      db: factory.createDb('bob-token'),
      auth: { userId: 'user-bob' },
      params: { shipmentId: id },
    };
    await assert.rejects(h.run(req, fakeRes()), (e) => e.status === 404);
  });

  it('rejects an invalid id', async () => {
    const t = setup();
    await assert.rejects(run(t, t.asAlice(), ''), (e) => e.status === 422);
  });
});

describe('re-running', () => {
  it('keeps a decision, does not duplicate, and replaces open items that disappeared', async () => {
    const t = setup();
    const id = await shipmentWithDocs(t.alice, 'user-alice', demoRows({ packingGross: '650 kg' }));
    const first = await run(t, t.asAlice(), id);
    const discrepancyId = first.body.data.discrepancies[0].id;

    const decided = await decide(t, t.asAlice(), discrepancyId, 'accepted');
    assert.equal(decided.body.data.reviewStatus, 'accepted');

    const second = await run(t, t.asAlice(), id);
    assert.equal(t.tables.discrepancies.length, 1);
    assert.equal(second.body.data.discrepancies[0].id, discrepancyId);
    assert.equal(second.body.data.discrepancies[0].reviewStatus, 'accepted');
    assert.equal(t.tables.discrepancies[0].reviewed_by, 'user-alice');
    assert.ok(t.tables.discrepancies[0].reviewed_at);
    assert.deepEqual(actions(t), ['crosscheck.run', 'discrepancy.reviewed', 'crosscheck.run']);
  });

  it('reopens a decided finding when the documents change, and shows the new values', async () => {
    const t = setup();
    const id = await shipmentWithDocs(t.alice, 'user-alice', demoRows({ packingGross: '650 kg' }));
    const first = await run(t, t.asAlice(), id);
    await decide(t, t.asAlice(), first.body.data.discrepancies[0].id, 'accepted');

    const packing = t.tables.document_extractions.find(
      (e) => e.reviewed_payload.document_type === 'packing_list',
    );
    packing.reviewed_payload = demoRows({ packingGross: '700 kg' })[1].reviewed_payload;
    const second = await run(t, t.asAlice(), id);
    const [d] = second.body.data.discrepancies;
    assert.equal(d.reviewStatus, 'open');
    assert.equal(d.reviewedAt, null);
    assert.equal(d.values.packing_list, '700 kg');
    assert.equal(t.tables.discrepancies.length, 1);
  });

  it('uses the newest reviewed document when a type appears twice', async () => {
    const t = setup();
    const rows = demoRows({ packingGross: '650 kg' });
    const oldPacking = demoRows({ packingGross: '900 kg' })[1];
    const id = await shipmentWithDocs(t.alice, 'user-alice', [oldPacking, ...rows]);
    const res = await run(t, t.asAlice(), id);
    assert.equal(res.body.data.discrepancies[0].values.packing_list, '650 kg');
  });

  it('removes an open finding once the documents agree, and updates one that changed', async () => {
    const t = setup();
    const id = await shipmentWithDocs(t.alice, 'user-alice', demoRows({ packingGross: '650 kg' }));
    await run(t, t.asAlice(), id);

    const packing = t.tables.document_extractions.find(
      (e) => e.reviewed_payload.document_type === 'packing_list',
    );
    packing.reviewed_payload = demoRows({ packingGross: '700 kg' })[1].reviewed_payload;
    const changed = await run(t, t.asAlice(), id);
    assert.equal(changed.body.data.discrepancies.length, 1);
    assert.equal(changed.body.data.discrepancies[0].values.packing_list, '700 kg');

    packing.reviewed_payload = demoRows()[1].reviewed_payload;
    const fixed = await run(t, t.asAlice(), id);
    assert.deepEqual(fixed.body.data.discrepancies, []);
    assert.equal(t.tables.discrepancies.length, 0);
  });
});

describe('GET /shipments/:id/discrepancies', () => {
  it('lists the stored findings for the owner', async () => {
    const t = setup();
    const id = await shipmentWithDocs(t.alice, 'user-alice', demoRows({ packingGross: '650 kg' }));
    await run(t, t.asAlice(), id);
    const res = await list(t, t.asAlice(), id);
    assert.equal(res.body.data.discrepancies.length, 1);
    assert.equal(res.body.data.summary.overall, 'high');
    assert.ok(res.body.data.checkedAt);
  });

  it('is empty before any run', async () => {
    const t = setup();
    const id = await shipmentWithDocs(t.alice, 'user-alice', demoRows());
    const res = await list(t, t.asAlice(), id);
    assert.deepEqual(res.body.data, { discrepancies: [], summary: null, checkedAt: null });
  });
});

describe('PATCH /discrepancies/:id', () => {
  async function withFinding() {
    const t = setup();
    const id = await shipmentWithDocs(t.alice, 'user-alice', demoRows({ packingGross: '650 kg' }));
    const res = await run(t, t.asAlice(), id);
    return { t, discrepancyId: res.body.data.discrepancies[0].id };
  }

  for (const status of ['accepted', 'resolved', 'dismissed']) {
    it(`records ${status} with reviewer, time and an audit entry`, async () => {
      const { t, discrepancyId } = await withFinding();
      const res = await decide(t, t.asAlice(), discrepancyId, status);
      assert.equal(res.body.data.reviewStatus, status);
      const row = t.tables.discrepancies[0];
      assert.equal(row.review_status, status);
      assert.equal(row.reviewed_by, 'user-alice');
      assert.ok(row.reviewed_at);
      const entry = t.tables.audit_logs.at(-1);
      assert.equal(entry.action, 'discrepancy.reviewed');
      assert.equal(entry.details.to, status);
      assert.equal(entry.details.discrepancyId, discrepancyId);
    });
  }

  it('rejects other values, including open', async () => {
    const { t, discrepancyId } = await withFinding();
    for (const bad of ['open', 'fraud', undefined]) {
      await assert.rejects(decide(t, t.asAlice(), discrepancyId, bad), (e) => e.status === 422);
    }
    assert.equal(t.tables.discrepancies[0].review_status ?? 'open', 'open');
  });

  it('gives Bob 404 and changes nothing', async () => {
    const { t, discrepancyId } = await withFinding();
    await assert.rejects(
      decide(t, t.asBob(), discrepancyId, 'dismissed'),
      (e) => e.status === 404 && e.code === 'DISCREPANCY_NOT_FOUND',
    );
    assert.equal(t.tables.discrepancies[0].review_status ?? 'open', 'open');
    assert.equal(actions(t).includes('discrepancy.reviewed'), false);
  });

  it('gives 404 for an unknown id', async () => {
    const { t } = await withFinding();
    await assert.rejects(decide(t, t.asAlice(), 'nope', 'accepted'), (e) => e.status === 404);
  });
});
