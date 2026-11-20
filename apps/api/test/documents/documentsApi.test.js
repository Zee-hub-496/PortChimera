import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../../src/middleware/errorHandler.js';
import { documentHandlers, stripComputed } from '../../src/modules/documents/handlers.js';
import { runJob } from '../../src/modules/documents/processJob.js';
import { buildLineItemRows } from '../../src/modules/documents/documentView.js';
import { DOCUMENT_TYPES } from '../../src/modules/documents/fileValidation.js';
import { createFakeProvider, emptyExtraction } from '../../src/ai/fakeProvider.js';
import { DOCUMENT_FIELDS } from '../../src/ai/fieldNames.js';
import { fakeDbFactory, fakeRes } from '../helpers/fakes.js';
import { field, missing, plainParse } from '../helpers/plainParser.js';
import { buildFixtures } from '../../../../scripts/generate-document-fixtures.mjs';

const fx = buildFixtures();
const PDF = fx['commercial-invoice.pdf'];
const nextTick = () => new Promise((r) => setImmediate(r));

const silent = { error() {}, warn() {}, log() {} };
const parseId = (v) => {
  if (typeof v !== 'string' || v === '') throw new AppError(422, 'VALIDATION_ERROR', 'bad id');
  return v;
};
const parseType = (v) => {
  if (!DOCUMENT_TYPES.includes(v)) throw new AppError(422, 'VALIDATION_ERROR', 'bad type');
  return v;
};
const parseReview = (type, body) => {
  try {
    return plainParse(type, body);
  } catch (e) {
    throw new AppError(422, 'VALIDATION_ERROR', e.message);
  }
};

function setup({ provider = createFakeProvider(), runJobImpl = runJob, configured = true } = {}) {
  const factory = fakeDbFactory(
    {
      shipments: [],
      documents: [],
      document_extractions: [],
      line_items: [],
      audit_logs: [],
    },
    { unique: { documents: ['shipment_id', 'document_type'] } },
  );
  const jobs = [];
  const h = documentHandlers({
    parseId,
    parseType,
    parseReview,
    parseExtraction: plainParse,
    getProvider: () => (configured ? provider : null),
    runJob: (args) => {
      const p = runJobImpl(args);
      jobs.push(p);
      return p;
    },
    logger: silent,
  });
  const alice = factory.createDb('alice-token');
  const bob = factory.createDb('bob-token');
  const reqFor = (db, userId, extra = {}) => ({
    db,
    auth: { userId },
    params: {},
    query: {},
    get: (n) => extra.headers?.[n.toLowerCase()],
    ...extra,
  });
  const asAlice = (extra) => reqFor(alice, 'user-alice', extra);
  const asBob = (extra) => reqFor(bob, 'user-bob', extra);
  return { factory, h, alice, bob, jobs, asAlice, asBob, provider };
}

async function newShipment(db, userId, number = 'SHP-1') {
  const { data } = await db
    .from('shipments')
    .insert({ user_id: userId, shipment_number: number })
    .select()
    .single();
  return data.id;
}

async function upload(h, req, shipmentId, { type = 'commercial_invoice', body = PDF } = {}) {
  const res = fakeRes();
  await h.upload({ ...req, params: { shipmentId }, query: { type }, body }, res);
  return res;
}

const rejects = (promise, status, code) =>
  assert.rejects(promise, (e) => e instanceof AppError && e.status === status && e.code === code);

function goodInvoice() {
  const r = emptyExtraction('commercial_invoice');
  r.fields.invoice_number = field('INV-2025-0042', 'Invoice No: INV-2025-0042');
  r.fields.currency = field('USD', 'USD');
  const line = (n, q) => {
    const l = Object.fromEntries(
      DOCUMENT_FIELDS.commercial_invoice.lineFields.map((f) => [f, missing()]),
    );
    l.name = field(n);
    l.quantity = field(q);
    l.unit_price = field(2.5);
    l.line_total = field(q * 2.5);
    return l;
  };
  r.lines = [line('Cotton shirts', 100), line('Denim jeans', 40)];
  return r;
}

async function uploaded(ctx, req = ctx.asAlice, db = ctx.alice, user = 'user-alice') {
  const shipmentId = await newShipment(db, user);
  const res = await upload(ctx.h, req(), shipmentId);
  return { shipmentId, doc: res.body.data };
}

describe('upload', () => {
  it('stores the file under the user folder, inserts a row and writes an audit entry', async () => {
    const ctx = setup();
    const shipmentId = await newShipment(ctx.alice, 'user-alice');
    const res = await upload(
      ctx.h,
      ctx.asAlice({ headers: { 'x-filename': '../../evil.pdf' } }),
      shipmentId,
    );
    assert.equal(res.statusCode, 201);
    const doc = res.body.data;
    assert.equal(doc.processingStatus, 'uploaded');
    assert.equal(doc.mimeType, 'application/pdf');
    assert.equal(doc.originalFilename, '../../evil.pdf');
    assert.ok(!('storage_path' in doc) && !('storagePath' in doc));
    const row = ctx.factory.inserts.find((i) => i.table === 'documents').row;
    assert.match(row.storage_path, new RegExp(`^user-alice/${shipmentId}/[0-9a-f-]{36}$`));
    assert.ok(!row.storage_path.includes('evil'));
    assert.ok(ctx.factory.objects.has(row.storage_path));
    const audit = ctx.factory.inserts.find((i) => i.table === 'audit_logs').row;
    assert.equal(audit.action, 'document.uploaded');
    assert.equal(audit.shipment_id, shipmentId);
  });

  it('rejects an EXE named .pdf by its bytes and stores nothing', async () => {
    const ctx = setup();
    const shipmentId = await newShipment(ctx.alice, 'user-alice');
    await rejects(
      upload(ctx.h, ctx.asAlice(), shipmentId, { body: fx['fake-invoice.pdf'] }),
      400,
      'UNSUPPORTED_FILE_TYPE',
    );
    assert.equal(ctx.factory.objects.size, 0);
  });

  it('rejects oversize, empty, unknown type and non-binary bodies', async () => {
    const ctx = setup();
    const shipmentId = await newShipment(ctx.alice, 'user-alice');
    const big = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(5 * 1024 * 1024)]);
    await rejects(upload(ctx.h, ctx.asAlice(), shipmentId, { body: big }), 413, 'FILE_TOO_LARGE');
    await rejects(
      upload(ctx.h, ctx.asAlice(), shipmentId, { body: Buffer.alloc(0) }),
      400,
      'EMPTY_FILE',
    );
    await rejects(
      upload(ctx.h, ctx.asAlice(), shipmentId, { type: 'nope' }),
      422,
      'VALIDATION_ERROR',
    );
    await rejects(
      upload(ctx.h, ctx.asAlice(), shipmentId, { body: { json: true } }),
      415,
      'UNSUPPORTED_MEDIA_TYPE',
    );
    assert.equal(ctx.factory.objects.size, 0);
  });

  it('answers 409 for a second document of the same type and removes the new object', async () => {
    const ctx = setup();
    const { shipmentId } = await uploaded(ctx);
    assert.equal(ctx.factory.objects.size, 1);
    await rejects(upload(ctx.h, ctx.asAlice(), shipmentId), 409, 'DOCUMENT_EXISTS');
    assert.equal(ctx.factory.objects.size, 1, 'no orphan object');
    assert.ok(ctx.factory.storageCalls.some((c) => c.op === 'remove'));
  });

  it("answers 404 for another user's shipment and stores nothing", async () => {
    const ctx = setup();
    const shipmentId = await newShipment(ctx.alice, 'user-alice');
    await rejects(upload(ctx.h, ctx.asBob(), shipmentId), 404, 'SHIPMENT_NOT_FOUND');
    assert.equal(ctx.factory.objects.size, 0);
  });

  it('keeps going when the audit write fails', async () => {
    const ctx = setup();
    const shipmentId = await newShipment(ctx.alice, 'user-alice');
    // Break only the audit insert by making the next insert fail after the document insert.
    const original = ctx.alice.from.bind(ctx.alice);
    ctx.alice.from = (t) =>
      t === 'audit_logs' ? { insert: async () => ({ error: { code: 'x' } }) } : original(t);
    const res = await upload(ctx.h, ctx.asAlice(), shipmentId);
    assert.equal(res.statusCode, 201);
  });

  it('saves no row and hides the details when the storage upload fails', async () => {
    const ctx = setup();
    const shipmentId = await newShipment(ctx.alice, 'user-alice');
    ctx.factory.failStorageWith({ message: 'boom secret-detail' });
    const err = await upload(ctx.h, ctx.asAlice(), shipmentId).catch((e) => e);
    assert.equal(err.code, 'UPLOAD_FAILED');
    assert.ok(!err.message.includes('secret-detail'));
    assert.equal(ctx.factory.inserts.filter((i) => i.table === 'documents').length, 0);
  });
});

describe('read, list and download', () => {
  it('lists documents of the shipment and hides them from other users', async () => {
    const ctx = setup();
    const { shipmentId } = await uploaded(ctx);
    const res = fakeRes();
    await ctx.h.list({ ...ctx.asAlice(), params: { shipmentId } }, res);
    assert.equal(res.body.data.length, 1);
    await rejects(
      ctx.h.list({ ...ctx.asBob(), params: { shipmentId } }, fakeRes()),
      404,
      'SHIPMENT_NOT_FOUND',
    );
  });

  it('returns a 60 second signed URL for the owner only', async () => {
    const ctx = setup();
    const { doc } = await uploaded(ctx);
    const res = fakeRes();
    await ctx.h.download({ ...ctx.asAlice(), params: { id: doc.id } }, res);
    assert.equal(res.body.data.expiresInSeconds, 60);
    assert.match(res.body.data.url, /^https:\/\//);
    assert.equal(ctx.factory.storageCalls.find((c) => c.op === 'sign').seconds, 60);
    await rejects(
      ctx.h.download({ ...ctx.asBob(), params: { id: doc.id } }, fakeRes()),
      404,
      'DOCUMENT_NOT_FOUND',
    );
  });

  it("bob cannot read, process or review alice's document", async () => {
    const ctx = setup();
    const { doc } = await uploaded(ctx);
    const bob = ctx.asBob({ params: { id: doc.id }, body: goodInvoice() });
    await rejects(ctx.h.get(bob, fakeRes()), 404, 'DOCUMENT_NOT_FOUND');
    await rejects(ctx.h.process(bob, fakeRes()), 404, 'DOCUMENT_NOT_FOUND');
    await rejects(ctx.h.review(bob, fakeRes()), 404, 'DOCUMENT_NOT_FOUND');
    assert.equal(ctx.provider.calls.length, 0);
  });

  it('code-level check: a document whose shipment is not the caller is still a 404', async () => {
    const factory = fakeDbFactory({ shipments: [], documents: [] }, { rls: false });
    const alice = factory.createDb('alice-token');
    const bob = factory.createDb('bob-token');
    const shipmentId = await newShipment(alice, 'user-alice');
    const { data: d } = await alice
      .from('documents')
      .insert({ shipment_id: shipmentId, document_type: 'packing_list' })
      .select()
      .single();
    const h = documentHandlers({
      parseId,
      parseType,
      parseReview,
      parseExtraction: plainParse,
      getProvider: () => null,
    });
    await rejects(
      h.get({ db: bob, auth: { userId: 'user-bob' }, params: { id: d.id } }, fakeRes()),
      404,
      'DOCUMENT_NOT_FOUND',
    );
  });
});

describe('process', () => {
  it('answers 503 AI_NOT_CONFIGURED when the provider is missing', async () => {
    const ctx = setup({ configured: false });
    const { doc } = await uploaded(ctx);
    await rejects(
      ctx.h.process({ ...ctx.asAlice(), params: { id: doc.id } }, fakeRes()),
      503,
      'AI_NOT_CONFIGURED',
    );
  });

  it('answers 202 before the provider finishes, then the job completes', async () => {
    let release;
    const gate = new Promise((r) => (release = r));
    const inner = createFakeProvider({ response: goodInvoice() });
    const provider = {
      calls: inner.calls,
      async extractDocument(input) {
        await gate;
        return inner.extractDocument(input);
      },
    };
    const ctx = setup({ provider });
    const { doc } = await uploaded(ctx);
    const res = fakeRes();
    await ctx.h.process({ ...ctx.asAlice(), params: { id: doc.id } }, res);
    assert.equal(res.statusCode, 202);
    assert.equal(res.body.data.processingStatus, 'processing');
    const row = () => ctx.factory.createDb('alice-token');
    const { data } = await row().from('documents').select('*').eq('id', doc.id).maybeSingle();
    assert.equal(data.processing_status, 'processing');
    release();
    await Promise.all(ctx.jobs);
    const after = await row().from('documents').select('*').eq('id', doc.id).maybeSingle();
    assert.equal(after.data.processing_status, 'extracted');
    const actions = ctx.factory.inserts
      .filter((i) => i.table === 'audit_logs')
      .map((i) => i.row.action);
    assert.ok(actions.includes('document.extracted'));
    const ex = ctx.factory.inserts.find((i) => i.table === 'document_extractions').row;
    assert.equal(ex.schema_version, 1);
    assert.equal(ex.payload.fields.invoice_number.evidence_verified, true);
  });

  it('a failing provider sets failed with a safe message and an audit entry', async () => {
    const provider = createFakeProvider({ mode: 'server500' });
    const ctx = setup({ provider });
    const { doc } = await uploaded(ctx);
    await ctx.h.process({ ...ctx.asAlice(), params: { id: doc.id } }, fakeRes());
    await Promise.all(ctx.jobs);
    const { data } = await ctx.alice.from('documents').select('*').eq('id', doc.id).maybeSingle();
    assert.equal(data.processing_status, 'failed');
    assert.equal(data.error_message, 'The AI service had a problem. Please try again.');
    assert.ok(!data.error_message.includes(data.storage_path));
    const audit = ctx.factory.inserts.filter((i) => i.table === 'audit_logs').map((i) => i.row);
    assert.ok(audit.some((a) => a.action === 'document.extraction_failed'));
  });

  it('malformed model output is rejected and the document fails', async () => {
    const ctx = setup({ provider: createFakeProvider({ mode: 'malformed' }) });
    const { doc } = await uploaded(ctx);
    await ctx.h.process({ ...ctx.asAlice(), params: { id: doc.id } }, fakeRes());
    await Promise.all(ctx.jobs);
    const { data } = await ctx.alice.from('documents').select('*').eq('id', doc.id).maybeSingle();
    assert.equal(data.processing_status, 'failed');
    assert.equal(ctx.factory.inserts.filter((i) => i.table === 'document_extractions').length, 0);
  });

  it('never leaks internal errors: an unexpected crash gives the generic message', async () => {
    const ctx = setup();
    const { doc } = await uploaded(ctx);
    ctx.factory.objects.clear(); // storage download will fail
    await ctx.h.process({ ...ctx.asAlice(), params: { id: doc.id } }, fakeRes());
    await Promise.all(ctx.jobs);
    const { data } = await ctx.alice.from('documents').select('*').eq('id', doc.id).maybeSingle();
    assert.equal(data.error_message, 'Extraction failed. Please try again.');
  });

  it('a cache hit (same file, same type) makes zero provider calls', async () => {
    const provider = createFakeProvider({ response: goodInvoice() });
    const ctx = setup({ provider });
    const first = await uploaded(ctx);
    await ctx.h.process({ ...ctx.asAlice(), params: { id: first.doc.id } }, fakeRes());
    await Promise.all(ctx.jobs);
    assert.equal(provider.calls.length, 1);

    const shipment2 = await newShipment(ctx.alice, 'user-alice', 'SHP-2');
    const second = (await upload(ctx.h, ctx.asAlice(), shipment2)).body.data;
    await ctx.h.process({ ...ctx.asAlice(), params: { id: second.id } }, fakeRes());
    await Promise.all(ctx.jobs);
    assert.equal(provider.calls.length, 1, 'no second AI call');
    const { data } = await ctx.alice
      .from('documents')
      .select('*')
      .eq('id', second.id)
      .maybeSingle();
    assert.equal(data.processing_status, 'extracted');
    const extractions = ctx.factory.inserts.filter((i) => i.table === 'document_extractions');
    assert.match(extractions[1].row.model, /^cache:/);
  });

  it('the cache never crosses users', async () => {
    const provider = createFakeProvider({ response: goodInvoice() });
    const ctx = setup({ provider });
    const first = await uploaded(ctx);
    await ctx.h.process({ ...ctx.asAlice(), params: { id: first.doc.id } }, fakeRes());
    await Promise.all(ctx.jobs);
    const bobShipment = await newShipment(ctx.bob, 'user-bob', 'B-1');
    const bobDoc = (await upload(ctx.h, ctx.asBob(), bobShipment)).body.data;
    await ctx.h.process({ ...ctx.asBob(), params: { id: bobDoc.id } }, fakeRes());
    await Promise.all(ctx.jobs);
    assert.equal(provider.calls.length, 2);
  });

  it('a document stuck in processing can be processed again', async () => {
    const ctx = setup({ provider: createFakeProvider({ response: goodInvoice() }) });
    const { doc } = await uploaded(ctx);
    await ctx.h.process({ ...ctx.asAlice(), params: { id: doc.id } }, fakeRes());
    await Promise.all(ctx.jobs);
    const res = fakeRes();
    await ctx.h.process({ ...ctx.asAlice(), params: { id: doc.id } }, res);
    await Promise.all(ctx.jobs);
    assert.equal(res.statusCode, 202);
  });

  it('runJob never throws, even with a broken storage client', async () => {
    const logs = [];
    const out = await runJob({
      db: setup().alice,
      userId: 'user-alice',
      doc: {
        id: 'x',
        shipment_id: 's',
        storage_path: 'p',
        sha256: 'h',
        document_type: 'packing_list',
      },
      provider: createFakeProvider(),
      parse: plainParse,
      logger: { error: (...a) => logs.push(a) },
      storage: {
        download: async () => {
          throw new Error('secret path user-alice/abc');
        },
      },
    });
    assert.equal(out.status, 'failed');
  });
});

describe('review', () => {
  async function extracted(ctx) {
    const made = await uploaded(ctx);
    await ctx.h.process({ ...ctx.asAlice(), params: { id: made.doc.id } }, fakeRes());
    await Promise.all(ctx.jobs);
    return made;
  }

  it('saves reviewed_payload, replaces line_items and sets reviewed', async () => {
    const ctx = setup({ provider: createFakeProvider({ response: goodInvoice() }) });
    const { doc, shipmentId } = await extracted(ctx);
    const edited = goodInvoice();
    edited.fields.invoice_number = field('INV-EDITED', 'INV-EDITED', { evidence_verified: true });
    const res = fakeRes();
    await ctx.h.review({ ...ctx.asAlice(), params: { id: doc.id }, body: edited }, res);
    const view = res.body.data;
    assert.equal(view.processingStatus, 'reviewed');
    assert.equal(view.extraction.reviewedPayload.fields.invoice_number.value, 'INV-EDITED');
    assert.ok(view.extraction.reviewedAt);
    assert.equal(view.extraction.payload.fields.invoice_number.value, 'INV-2025-0042');
    const rows = await ctx.alice.from('line_items').select('*').eq('shipment_id', shipmentId);
    assert.deepEqual(
      rows.data.map((r) => [r.line_no, r.description, r.quantity, r.total_value, r.currency]),
      [
        [1, 'Cotton shirts', 100, 250, 'USD'],
        [2, 'Denim jeans', 40, 100, 'USD'],
      ],
    );

    // A second review replaces, not appends.
    edited.lines = [edited.lines[0]];
    await ctx.h.review({ ...ctx.asAlice(), params: { id: doc.id }, body: edited }, fakeRes());
    const again = await ctx.alice.from('line_items').select('*').eq('shipment_id', shipmentId);
    assert.equal(again.data.length, 1);
    const actions = ctx.factory.inserts
      .filter((i) => i.table === 'audit_logs')
      .map((i) => i.row.action);
    assert.equal(actions.filter((a) => a === 'document.reviewed').length, 2);
  });

  it('rejects an invalid body with 422 and saves nothing', async () => {
    const ctx = setup({ provider: createFakeProvider({ response: goodInvoice() }) });
    const { doc } = await extracted(ctx);
    const bad = goodInvoice();
    bad.fields.exporter = { value: 'x', confidence: 0.5, status: 'missing', evidence: null };
    await assert.rejects(
      ctx.h.review({ ...ctx.asAlice(), params: { id: doc.id }, body: bad }, fakeRes()),
      (e) => e.status === 422,
    );
    const { data } = await ctx.alice.from('documents').select('*').eq('id', doc.id).maybeSingle();
    assert.equal(data.processing_status, 'extracted');
  });

  it('answers 409 when there is nothing to review yet', async () => {
    const ctx = setup();
    const { doc } = await uploaded(ctx);
    await rejects(
      ctx.h.review({ ...ctx.asAlice(), params: { id: doc.id }, body: goodInvoice() }, fakeRes()),
      409,
      'DOCUMENT_NOT_EXTRACTED',
    );
  });

  it('does not create line_items for a packing list', async () => {
    const ctx = setup({ provider: createFakeProvider() });
    const shipmentId = await newShipment(ctx.alice, 'user-alice');
    const doc = (await upload(ctx.h, ctx.asAlice(), shipmentId, { type: 'packing_list' })).body
      .data;
    await ctx.h.process({ ...ctx.asAlice(), params: { id: doc.id } }, fakeRes());
    await Promise.all(ctx.jobs);
    await ctx.h.review(
      { ...ctx.asAlice(), params: { id: doc.id }, body: emptyExtraction('packing_list') },
      fakeRes(),
    );
    assert.equal(ctx.factory.inserts.filter((i) => i.table === 'line_items').length, 0);
  });
});

describe('response hygiene', () => {
  it('detail view never exposes storage paths, user ids or keys', async () => {
    const ctx = setup({ provider: createFakeProvider({ response: goodInvoice() }) });
    const { doc } = await uploaded(ctx);
    await ctx.h.process({ ...ctx.asAlice(), params: { id: doc.id } }, fakeRes());
    await Promise.all(ctx.jobs);
    const res = fakeRes();
    await ctx.h.get({ ...ctx.asAlice(), params: { id: doc.id } }, res);
    const text = JSON.stringify(res.body);
    assert.ok(!text.includes('user-alice'));
    assert.ok(!text.includes('storage_path'));
    assert.ok(!/api[_-]?key/i.test(text));
  });
});

describe('helpers', () => {
  it('stripComputed removes server-computed keys only', () => {
    const out = stripComputed({
      schema_version: 1,
      document_type: 'x',
      fields: { a: { value: 1, evidence_verified: true } },
      lines: [{ b: { value: 2, evidence_verified: false } }],
    });
    assert.deepEqual(out, { fields: { a: { value: 1 } }, lines: [{ b: { value: 2 } }] });
    assert.equal(stripComputed(null), null);
  });

  it('buildLineItemRows skips lines without a description and nulls bad numbers', () => {
    const rows = buildLineItemRows({
      shipmentId: 's',
      documentId: 'd',
      payload: {
        fields: { currency: field('usd') },
        lines: [
          {
            name: field('A'),
            quantity: field('12'),
            unit_price: field(-1),
            net_weight: field('abc'),
          },
          { name: missing(), description: missing() },
          { description: field('B') },
        ],
      },
    });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].quantity, 12);
    assert.equal(rows[0].unit_price, null);
    assert.equal(rows[0].net_weight_kg, null);
    assert.equal(rows[0].currency, 'USD');
    assert.equal(rows[1].line_no, 2);
  });
});
