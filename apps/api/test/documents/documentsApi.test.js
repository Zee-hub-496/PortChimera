import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../../src/middleware/errorHandler.js';
import { documentHandlers, stripComputed } from '../../src/modules/documents/handlers.js';
import { runJob } from '../../src/modules/documents/processJob.js';
import { buildLineItemRows } from '../../src/modules/documents/documentView.js';
import { DOCUMENT_TYPES } from '../../src/modules/documents/fileValidation.js';
import { createFakeProvider, emptyExtraction } from '../../src/ai/fakeProvider.js';
import { DOCUMENT_FIELDS, SCHEMA_VERSION } from '../../src/ai/fieldNames.js';
import { fakeDbFactory, fakeRes } from '../helpers/fakes.js';
import { field, missing, plainParse } from '../helpers/plainParser.js';
import { buildFixtures } from '../../../../scripts/generate-document-fixtures.mjs';

const fx = buildFixtures();
const PDF = fx['commercial-invoice.pdf'];

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
  const tables = {
    shipments: [],
    documents: [],
    document_extractions: [],
    line_items: [],
    audit_logs: [],
  };
  const factory = fakeDbFactory(tables, {
    unique: {
      documents: ['shipment_id', 'document_type'],
      line_items: ['shipment_id', 'source_document_id', 'line_no'],
    },
  });
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
  return { factory, tables, h, alice, bob, jobs, asAlice, asBob, provider };
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
    assert.equal(ex.schema_version, SCHEMA_VERSION);
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

  it('a document left in processing by a restart can be processed again', async () => {
    const ctx = setup({ provider: createFakeProvider({ response: goodInvoice() }) });
    const { doc } = await uploaded(ctx);
    docRowSync(ctx, doc.id).processing_status = 'processing';
    const res = fakeRes();
    await ctx.h.process({ ...ctx.asAlice(), params: { id: doc.id } }, res);
    await Promise.all(ctx.jobs);
    assert.equal(res.statusCode, 202);
    assert.equal(ctx.jobs.length, 1);
    assert.equal((await docRow(ctx, doc.id)).processing_status, 'extracted');
  });

  it('records when processing started', async () => {
    const ctx = setup({ provider: createFakeProvider({ response: goodInvoice() }) });
    const { doc } = await uploaded(ctx);
    await ctx.h.process({ ...ctx.asAlice(), params: { id: doc.id } }, fakeRes());
    assert.ok(!Number.isNaN(Date.parse(docRowSync(ctx, doc.id).processing_started_at)));
    await Promise.all(ctx.jobs);
  });

  describe('a document stuck in processing after a restart', () => {
    const OLD = '2020-01-01T00:00:00.000Z';
    const stick = (ctx, id, startedAt) => {
      const row = docRowSync(ctx, id);
      row.processing_status = 'processing';
      row.processing_started_at = startedAt;
    };

    it('is marked failed when listed, with an audit entry, and can then be processed', async () => {
      const ctx = setup({ provider: createFakeProvider({ response: goodInvoice() }) });
      const { doc, shipmentId } = await uploaded(ctx);
      stick(ctx, doc.id, OLD);
      const res = fakeRes();
      await ctx.h.list({ ...ctx.asAlice(), params: { shipmentId } }, res);
      const listed = res.body.data.find((d) => d.id === doc.id);
      assert.equal(listed.processingStatus, 'failed');
      assert.match(listed.errorMessage, /interrupted/i);
      assert.equal((await docRow(ctx, doc.id)).processing_status, 'failed');
      assert.ok(ctx.tables.audit_logs.some((a) => a.action === 'document.processing_interrupted'));
      await ctx.h.process({ ...ctx.asAlice(), params: { id: doc.id } }, fakeRes());
      await Promise.all(ctx.jobs);
      assert.equal((await docRow(ctx, doc.id)).processing_status, 'extracted');
    });

    it('is marked failed when opened, and a row with no timestamp counts as stuck', async () => {
      const ctx = setup();
      const { doc } = await uploaded(ctx);
      stick(ctx, doc.id, null);
      const res = fakeRes();
      await ctx.h.get({ ...ctx.asAlice(), params: { id: doc.id } }, res);
      assert.equal(res.body.data.processingStatus, 'failed');
    });

    it('is left alone when it started recently', async () => {
      const ctx = setup();
      const { doc } = await uploaded(ctx);
      stick(ctx, doc.id, new Date().toISOString());
      const res = fakeRes();
      await ctx.h.get({ ...ctx.asAlice(), params: { id: doc.id } }, res);
      assert.equal(res.body.data.processingStatus, 'processing');
      assert.equal(ctx.tables.audit_logs.filter((a) => a.action.includes('interrupted')).length, 0);
    });

    it('is left alone while a job for it is running in this process', async () => {
      const ctx = setup({ runJobImpl: () => new Promise(() => {}) });
      const { doc } = await uploaded(ctx);
      await ctx.h.process({ ...ctx.asAlice(), params: { id: doc.id } }, fakeRes());
      docRowSync(ctx, doc.id).processing_started_at = OLD;
      const res = fakeRes();
      await ctx.h.get({ ...ctx.asAlice(), params: { id: doc.id } }, res);
      assert.equal(res.body.data.processingStatus, 'processing');
    });

    it("never touches another user's document", async () => {
      const ctx = setup();
      const { doc } = await uploaded(ctx);
      stick(ctx, doc.id, OLD);
      await rejects(
        ctx.h.get({ ...ctx.asBob(), params: { id: doc.id } }, fakeRes()),
        404,
        'DOCUMENT_NOT_FOUND',
      );
      assert.equal(docRowSync(ctx, doc.id).processing_status, 'processing');
    });
  });

  it('answers DOCUMENT_BUSY when the status changes between the read and the update', async () => {
    const ctx = setup({ provider: createFakeProvider({ response: goodInvoice() }) });
    const { doc } = await uploaded(ctx);
    const racing = {
      ...ctx.alice,
      from(table) {
        const api = ctx.alice.from(table);
        if (table !== 'documents') return api;
        const update = api.update.bind(api);
        api.update = (values) => {
          // Another instance got there first, after our read.
          docRowSync(ctx, doc.id).processing_status = 'processing';
          return update(values);
        };
        return api;
      },
    };
    await rejects(
      ctx.h.process({ ...ctx.asAlice({ db: racing }), params: { id: doc.id } }, fakeRes()),
      409,
      'DOCUMENT_BUSY',
    );
    assert.equal(ctx.jobs.length, 0);
  });

  it('rejects a second process call while a job runs, and keeps the good extraction', async () => {
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
    const req = () => ({ ...ctx.asAlice(), params: { id: doc.id } });
    const [first, second] = await Promise.allSettled([
      ctx.h.process(req(), fakeRes()),
      ctx.h.process(req(), fakeRes()),
    ]);
    assert.equal(first.status, 'fulfilled');
    assert.equal(second.status, 'rejected');
    assert.equal(second.reason.code, 'DOCUMENT_BUSY');
    await rejects(ctx.h.process(req(), fakeRes()), 409, 'DOCUMENT_BUSY');
    release();
    await Promise.all(ctx.jobs);
    assert.equal(ctx.jobs.length, 1);
    const { data } = await ctx.alice.from('documents').select('*').eq('id', doc.id).maybeSingle();
    assert.equal(data.processing_status, 'extracted');
    // The id is released once the job ends.
    const again = fakeRes();
    await ctx.h.process(req(), again);
    await Promise.all(ctx.jobs);
    assert.equal(again.statusCode, 202);
  });

  it('a job that lost its document does not overwrite a reviewed extraction or status', async () => {
    const ctx = setup({ provider: createFakeProvider({ response: goodInvoice() }) });
    const { doc } = await uploaded(ctx);
    await ctx.h.process({ ...ctx.asAlice(), params: { id: doc.id } }, fakeRes());
    await Promise.all(ctx.jobs);
    await ctx.h.review(
      { ...ctx.asAlice(), params: { id: doc.id }, body: goodInvoice() },
      fakeRes(),
    );
    const out = await runJob({
      db: ctx.alice,
      userId: 'user-alice',
      doc: { ...(await docRow(ctx, doc.id)), processing_status: 'processing' },
      provider: createFakeProvider({ response: goodInvoice() }),
      parse: plainParse,
      logger: silent,
      storage: ctx.alice.storage.from('documents'),
    });
    assert.equal(out.status, 'superseded');
    const failures = ctx.factory.inserts.filter(
      (i) => i.table === 'audit_logs' && i.row.action === 'document.extraction_failed',
    );
    assert.equal(failures.length, 0);
    const row = await docRow(ctx, doc.id);
    assert.equal(row.processing_status, 'reviewed');
    const ex = await ctx.alice.from('document_extractions').select('*').eq('document_id', doc.id);
    assert.equal(ex.data.length, 1);
    assert.ok(ex.data[0].reviewed_payload);
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

function docRowSync(ctx, id) {
  return ctx.tables.documents.find((d) => d.id === id);
}

async function docRow(ctx, id) {
  const { data } = await ctx.alice.from('documents').select('*').eq('id', id).maybeSingle();
  return data;
}

/** Wraps a db so that one operation on one table resolves with { error }, like supabase-js. */
function failing(db, table, op, { when = () => true, times = 1 } = {}) {
  let left = times;
  return {
    ...db,
    from(name) {
      const api = db.from(name);
      if (name !== table) return api;
      const real = api[op].bind(api);
      api[op] = (arg) => {
        if (left > 0 && when(arg)) {
          left -= 1;
          const chain = {
            eq: () => chain,
            select: () => chain,
            then: (res, rej) =>
              Promise.resolve({ data: null, error: { message: 'boom' } }).then(res, rej),
          };
          return chain;
        }
        return real(arg);
      };
      return api;
    },
  };
}

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

  it('refuses a review while the document is processing', async () => {
    const ctx = setup({ provider: createFakeProvider({ response: goodInvoice() }) });
    const { doc } = await extracted(ctx);
    docRowSync(ctx, doc.id).processing_status = 'processing';
    await rejects(
      ctx.h.review({ ...ctx.asAlice(), params: { id: doc.id }, body: goodInvoice() }, fakeRes()),
      409,
      'DOCUMENT_NOT_EXTRACTED',
    );
    const ex = await ctx.alice.from('document_extractions').select('*').eq('document_id', doc.id);
    assert.equal(ex.data[0].reviewed_payload, undefined);
  });

  it('refuses a review after a failed re-run', async () => {
    const ctx = setup({ provider: createFakeProvider({ response: goodInvoice() }) });
    const { doc } = await extracted(ctx);
    docRowSync(ctx, doc.id).processing_status = 'failed';
    await rejects(
      ctx.h.review({ ...ctx.asAlice(), params: { id: doc.id }, body: goodInvoice() }, fakeRes()),
      409,
      'DOCUMENT_NOT_EXTRACTED',
    );
  });

  describe('line item sync', () => {
    async function reviewed() {
      const logs = [];
      const ctx = setup({ provider: createFakeProvider({ response: goodInvoice() }) });
      const { doc, shipmentId } = await extracted(ctx);
      await ctx.h.review(
        { ...ctx.asAlice(), params: { id: doc.id }, body: goodInvoice() },
        fakeRes(),
      );
      const lines = async () =>
        (await ctx.alice.from('line_items').select('*').eq('shipment_id', shipmentId)).data;
      const before = (await lines()).map((r) => ({ ...r }));
      const review = (db, body) =>
        ctx.h.review({ ...ctx.asAlice({ db }), params: { id: doc.id }, body }, fakeRes());
      const h = documentHandlers({
        parseId,
        parseType,
        parseReview,
        parseExtraction: plainParse,
        getProvider: () => null,
        logger: { error: (...a) => logs.push(a), warn() {}, log() {} },
      });
      const reviewLogged = (db, body) =>
        h.review({ ...ctx.asAlice({ db }), params: { id: doc.id }, body }, fakeRes());
      return { ctx, doc, lines, before, review, reviewLogged, logs };
    }

    it('keeps the ids of lines that still exist, so dependent rows survive a re-review', async () => {
      const { ctx, lines, before, review, doc } = await reviewed();
      const edited = goodInvoice();
      edited.lines[0].quantity = field(77);
      await review(ctx.alice, edited);
      const after = await lines();
      assert.deepEqual(
        after.map((r) => [r.id, r.line_no, r.description, r.quantity]),
        [
          [before[0].id, 1, 'Cotton shirts', 77],
          [before[1].id, 2, 'Denim jeans', 40],
        ],
      );
      assert.equal(ctx.factory.deletes.filter((d) => d.table === 'line_items').length, 0);
      assert.ok(doc);
    });

    it('inserts new lines and deletes only the lines that are gone', async () => {
      const { ctx, lines, before, review } = await reviewed();
      const more = goodInvoice();
      more.lines.push({ ...more.lines[0], name: field('Socks') });
      await review(ctx.alice, more);
      const grown = await lines();
      assert.equal(grown.length, 3);
      assert.equal(grown[0].id, before[0].id);
      assert.equal(grown[1].id, before[1].id);
      const fewer = goodInvoice();
      fewer.lines = [fewer.lines[0]];
      await review(ctx.alice, fewer);
      const shrunk = await lines();
      assert.deepEqual(
        shrunk.map((r) => r.id),
        [before[0].id],
      );
    });

    it('undoes updates and inserts when a later line item write fails', async () => {
      const { ctx, lines, before, review } = await reviewed();
      const edited = goodInvoice();
      edited.lines[0].name = field('Changed');
      edited.lines.push({ ...edited.lines[0], name: field('New line') });
      await rejects(
        review(failing(ctx.alice, 'line_items', 'insert'), edited),
        500,
        'LINE_ITEMS_FAILED',
      );
      assert.deepEqual(await lines(), before);
    });

    it('puts back updated, inserted and deleted lines when the review payload save fails', async () => {
      const { ctx, lines, before, review } = await reviewed();
      const edited = goodInvoice();
      edited.lines[0].name = field('Changed');
      edited.lines = [edited.lines[0]];
      await rejects(
        review(failing(ctx.alice, 'document_extractions', 'update'), edited),
        500,
        'REVIEW_SAVE_FAILED',
      );
      const after = await lines();
      assert.deepEqual(
        after.map((r) => [r.id, r.line_no, r.description]),
        before.map((r) => [r.id, r.line_no, r.description]),
      );
      const ex = await ctx.alice
        .from('document_extractions')
        .select('*')
        .eq('document_id', (await docRow(ctx, before[0].source_document_id)).id);
      assert.equal(ex.data[0].reviewed_payload.fields.invoice_number.value, 'INV-2025-0042');
    });

    it('removing the first line keeps the second row for the second line', async () => {
      const { ctx, lines, before, review } = await reviewed();
      const edited = goodInvoice();
      edited.lines = [edited.lines[1]];
      await review(ctx.alice, edited);
      const after = await lines();
      assert.deepEqual(
        after.map((r) => [r.id, r.line_no, r.description]),
        [[before[1].id, 1, 'Denim jeans']],
      );
      assert.ok(!after.some((r) => r.id === before[0].id));
    });

    it('reordering lines moves line_no but never reuses a row for different goods', async () => {
      const { ctx, lines, before, review } = await reviewed();
      const edited = goodInvoice();
      edited.lines.reverse();
      await review(ctx.alice, edited);
      const byId = Object.fromEntries((await lines()).map((r) => [r.id, r]));
      assert.equal(byId[before[0].id].description, 'Cotton shirts');
      assert.equal(byId[before[0].id].line_no, 2);
      assert.equal(byId[before[1].id].description, 'Denim jeans');
      assert.equal(byId[before[1].id].line_no, 1);
      assert.equal(Object.keys(byId).length, 2);
      assert.equal(ctx.factory.deletes.filter((d) => d.table === 'line_items').length, 0);
    });

    it('a renamed line is different goods: old row deleted, new row inserted', async () => {
      const { ctx, lines, before, review } = await reviewed();
      const edited = goodInvoice();
      edited.lines[0].name = field('Silk scarves');
      await review(ctx.alice, edited);
      const after = await lines();
      assert.equal(after.length, 2);
      assert.ok(!after.some((r) => r.id === before[0].id));
      assert.ok(after.some((r) => r.id === before[1].id && r.line_no === 2));
      assert.ok(after.some((r) => r.line_no === 1 && r.description === 'Silk scarves'));
    });

    it('restores removed first line and reordered rows when the payload save fails', async () => {
      const { ctx, lines, before, review } = await reviewed();
      const edited = goodInvoice();
      edited.lines = [edited.lines[1]];
      await rejects(
        review(failing(ctx.alice, 'document_extractions', 'update'), edited),
        500,
        'REVIEW_SAVE_FAILED',
      );
      const after = (await lines()).sort((a, b) => a.line_no - b.line_no);
      assert.deepEqual(
        after.map((r) => [r.line_no, r.description]),
        before.map((r) => [r.line_no, r.description]),
      );
    });

    it('logs line_items_restore_failed with step reinsert when putting a deleted row back fails', async () => {
      const { ctx, reviewLogged, logs } = await reviewed();
      const edited = goodInvoice();
      edited.lines = [edited.lines[0]];
      const db = failing(
        failing(ctx.alice, 'document_extractions', 'update'),
        'line_items',
        'insert',
      );
      await rejects(reviewLogged(db, edited), 500, 'REVIEW_SAVE_FAILED');
      assert.ok(logs.some((l) => l[0] === 'line_items_restore_failed' && l[1].step === 'reinsert'));
    });

    it('logs line_items_restore_failed with step remove_inserted when removing a new row fails', async () => {
      const { ctx, reviewLogged, logs } = await reviewed();
      const edited = goodInvoice();
      edited.lines.push({ ...edited.lines[0], name: field('Socks') });
      const db = failing(
        failing(ctx.alice, 'document_extractions', 'update'),
        'line_items',
        'delete',
      );
      await rejects(reviewLogged(db, edited), 500, 'REVIEW_SAVE_FAILED');
      assert.ok(
        logs.some((l) => l[0] === 'line_items_restore_failed' && l[1].step === 'remove_inserted'),
      );
    });

    it('logs line_items_restore_failed when the undo itself returns an error', async () => {
      const { ctx, reviewLogged, logs } = await reviewed();
      const edited = goodInvoice();
      edited.lines[0].quantity = field(77);
      // The change works, the revert update (back to quantity 100) fails, and the payload save fails.
      const db = failing(
        failing(ctx.alice, 'document_extractions', 'update'),
        'line_items',
        'update',
        { when: (v) => v.quantity === 100, times: 1 },
      );
      await rejects(reviewLogged(db, edited), 500, 'REVIEW_SAVE_FAILED');
      assert.ok(logs.some((l) => l[0] === 'line_items_restore_failed'));
    });
  });

  it('logs document_fail_update_failed when marking a document failed returns an error', async () => {
    const logs = [];
    const ctx = setup();
    const { doc } = await uploaded(ctx);
    const row = docRowSync(ctx, doc.id);
    row.processing_status = 'processing';
    const out = await runJob({
      db: failing(ctx.alice, 'documents', 'update'),
      userId: 'user-alice',
      doc: row,
      provider: createFakeProvider(),
      parse: plainParse,
      logger: { error: (...a) => logs.push(a), warn() {}, log() {} },
      storage: { download: async () => ({ data: null, error: { message: 'gone' } }) },
    });
    assert.equal(out.status, 'failed');
    assert.ok(logs.some((l) => l[0] === 'document_fail_update_failed'));
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

describe('shipment status follows the document flow', () => {
  const statusOf = async (ctx, shipmentId) =>
    (await ctx.alice.from('shipments').select('*').eq('id', shipmentId).maybeSingle()).data.status;

  it('submitted -> ai_processing -> requires_review when extraction succeeds', async () => {
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
    const { doc, shipmentId } = await uploaded(ctx);
    assert.equal(await statusOf(ctx, shipmentId), 'submitted');
    await ctx.h.process({ ...ctx.asAlice(), params: { id: doc.id } }, fakeRes());
    assert.equal(await statusOf(ctx, shipmentId), 'ai_processing');
    release();
    await Promise.all(ctx.jobs);
    assert.equal(await statusOf(ctx, shipmentId), 'requires_review');
  });

  it('goes back to submitted when extraction fails', async () => {
    const ctx = setup({ provider: createFakeProvider({ mode: 'server500' }) });
    const { doc, shipmentId } = await uploaded(ctx);
    await ctx.h.process({ ...ctx.asAlice(), params: { id: doc.id } }, fakeRes());
    await Promise.all(ctx.jobs);
    assert.equal(await statusOf(ctx, shipmentId), 'submitted');
  });

  it('stays submitted after one approved document while others are missing', async () => {
    const ctx = setup({ provider: createFakeProvider({ response: goodInvoice() }) });
    const { doc, shipmentId } = await uploaded(ctx);
    await ctx.h.process({ ...ctx.asAlice(), params: { id: doc.id } }, fakeRes());
    await Promise.all(ctx.jobs);
    await ctx.h.review(
      { ...ctx.asAlice(), params: { id: doc.id }, body: goodInvoice() },
      fakeRes(),
    );
    assert.equal(await statusOf(ctx, shipmentId), 'submitted');
  });
});
