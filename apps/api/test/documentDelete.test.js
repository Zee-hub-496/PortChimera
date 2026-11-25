import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../src/middleware/errorHandler.js';
import { deleteDocument } from '../src/modules/documents/service.js';
import { setStatusWriter, syncShipmentStatus } from '../src/modules/shipments/statusSync.js';
import { fakeDbFactory } from './helpers/fakes.js';

const silent = { error() {}, warn() {}, log() {} };

function setup() {
  const tables = {
    shipments: [],
    documents: [],
    document_extractions: [],
    line_items: [],
    discrepancies: [],
    audit_logs: [],
  };
  const factory = fakeDbFactory(tables);
  return {
    tables,
    factory,
    alice: factory.createDb('alice-token'),
    bob: factory.createDb('bob-token'),
  };
}

/** Alice's shipment with an invoice and a packing list, each with a stored file and a line item. */
async function seed(t) {
  const { data: shipment } = await t.alice
    .from('shipments')
    .insert({
      user_id: 'user-alice',
      shipment_number: 'S-1',
      cross_check_summary: { overall: 'mismatch' },
      cross_checked_at: '2026-01-02T00:00:00.000Z',
    })
    .select()
    .single();
  const docs = {};
  for (const type of ['commercial_invoice', 'packing_list']) {
    const path = `user-alice/${shipment.id}/${type}`;
    await t.alice.storage.from('documents').upload(path, Buffer.from('x'));
    const { data: doc } = await t.alice
      .from('documents')
      .insert({ shipment_id: shipment.id, document_type: type, storage_path: path })
      .select()
      .single();
    t.tables.documents.find((d) => d.id === doc.id).processing_status = 'reviewed';
    await t.alice.from('document_extractions').insert({ document_id: doc.id, payload: {} });
    await t.alice
      .from('line_items')
      .insert({ shipment_id: shipment.id, source_document_id: doc.id, line_no: 1 });
    docs[type] = { ...doc, storage_path: path };
  }
  const finding = (values, review_status = 'open') =>
    t.alice.from('discrepancies').insert({
      shipment_id: shipment.id,
      document_values: values,
      review_status,
    });
  await finding({ commercial_invoice: 500, packing_list: 650 }, 'resolved');
  await finding({ packing_list: 1, certificate_of_origin: 2 });
  await finding({ certificate_of_origin: 'a', other: 'b' });
  return { shipment, docs };
}

describe('deleteDocument', () => {
  it('removes the file, line items, findings and the saved check; keeps the rest', async () => {
    const t = setup();
    const { shipment, docs } = await seed(t);
    const inv = docs.commercial_invoice;

    const out = await deleteDocument(t.alice, 'user-alice', inv.id, { logger: silent });

    assert.deepEqual(out, { id: inv.id });
    assert.equal(t.factory.objects.has(inv.storage_path), false, 'file removed');
    assert.equal(t.factory.objects.has(docs.packing_list.storage_path), true, 'other file kept');
    assert.equal(
      t.tables.documents.some((d) => d.id === inv.id),
      false,
    );
    assert.equal(t.tables.documents.length, 1);
    assert.equal(t.tables.line_items.filter((l) => l.source_document_id === inv.id).length, 0);
    assert.equal(t.tables.line_items.length, 1);
    // Only the finding that compares the invoice is gone.
    assert.equal(t.tables.discrepancies.length, 2);
    const s = t.tables.shipments.find((x) => x.id === shipment.id);
    assert.equal(s.cross_check_summary, null);
    assert.equal(s.cross_checked_at, null);
    assert.equal(s.status, 'submitted'); // a required document is missing
    const audit = t.tables.audit_logs.find((a) => a.action === 'document.deleted');
    assert.deepEqual(audit.details, {
      documentId: inv.id,
      documentType: 'commercial_invoice',
      findingsRemoved: 1,
    });
  });

  it('removes findings of every review state for that document', async () => {
    const t = setup();
    const { docs } = await seed(t);
    await deleteDocument(t.alice, 'user-alice', docs.packing_list.id, { logger: silent });
    assert.equal(t.tables.discrepancies.length, 1); // only the certificate/other one is left
  });

  it("refuses another user's document and changes nothing", async () => {
    const t = setup();
    const { docs } = await seed(t);
    await assert.rejects(
      deleteDocument(t.bob, 'user-bob', docs.commercial_invoice.id, { logger: silent }),
      (e) => e instanceof AppError && e.status === 404 && e.code === 'DOCUMENT_NOT_FOUND',
    );
    assert.equal(t.tables.documents.length, 2);
    assert.equal(t.factory.objects.size, 2);
    assert.equal(t.tables.discrepancies.length, 3);
  });

  it('refuses while the document is being read', async () => {
    const t = setup();
    const { docs } = await seed(t);
    await assert.rejects(
      deleteDocument(t.alice, 'user-alice', docs.commercial_invoice.id, { isActive: true }),
      (e) => e.code === 'DOCUMENT_BUSY' && e.status === 409,
    );
    t.tables.documents.find((d) => d.id === docs.packing_list.id).processing_status = 'processing';
    await assert.rejects(
      deleteDocument(t.alice, 'user-alice', docs.packing_list.id),
      (e) => e.code === 'DOCUMENT_BUSY',
    );
    assert.equal(t.tables.documents.length, 2);
    assert.equal(t.factory.objects.size, 2);
  });

  it('keeps the row when the file cannot be removed, so nothing is orphaned', async () => {
    const t = setup();
    const { docs } = await seed(t);
    const failing = {
      from: (table) => t.alice.from(table),
      storage: {
        from: () => ({ remove: async () => ({ data: null, error: { message: 'down' } }) }),
      },
    };
    await assert.rejects(
      deleteDocument(failing, 'user-alice', docs.commercial_invoice.id, { logger: silent }),
      (e) => e.code === 'DOCUMENT_FILE_DELETE_FAILED',
    );
    assert.equal(t.tables.documents.length, 2);
    assert.equal(t.tables.line_items.length, 2);
  });

  it('can be repeated when the file is already gone', async () => {
    const t = setup();
    const { docs } = await seed(t);
    const id = docs.commercial_invoice.id;
    await t.alice.storage.from('documents').remove([docs.commercial_invoice.storage_path]);
    await deleteDocument(t.alice, 'user-alice', id, { logger: silent });
    assert.equal(
      t.tables.documents.some((d) => d.id === id),
      false,
    );
  });
});

describe('status writes use the server-only writer', () => {
  afterEach(() => setStatusWriter(null));

  function recordingWriter(t) {
    const writes = [];
    return {
      writes,
      from(table) {
        return {
          update(values) {
            const filters = {};
            const chain = {
              eq(c, v) {
                filters[c] = v;
                return chain;
              },
              then(resolve) {
                writes.push({ table, values, filters });
                Object.assign(
                  t.tables.shipments.find((s) => s.id === filters.id),
                  values,
                );
                return Promise.resolve({ error: null }).then(resolve);
              },
            };
            return chain;
          },
        };
      },
    };
  }

  it('writes status through the writer, not the signed-in client', async () => {
    const t = setup();
    const { shipment } = await seed(t);
    t.tables.shipments.find((s) => s.id === shipment.id).status = 'requires_review';
    const writer = recordingWriter(t);
    setStatusWriter(writer);

    const next = await syncShipmentStatus(t.alice, 'user-alice', shipment.id, silent);

    assert.equal(next, 'submitted'); // only two of three required documents exist
    assert.equal(writer.writes.length, 1);
    assert.equal(writer.writes[0].table, 'shipments');
    assert.deepEqual(Object.keys(writer.writes[0].values), ['status']);
    assert.equal(writer.writes[0].filters.user_id, 'user-alice');
    assert.equal(
      t.factory.updates.some((u) => u.table === 'shipments' && 'status' in u.values),
      false,
      'the signed-in client never wrote status',
    );
  });

  it("does not use the writer for someone else's shipment", async () => {
    const t = setup();
    const { shipment } = await seed(t);
    const writer = recordingWriter(t);
    setStatusWriter(writer);
    assert.equal(await syncShipmentStatus(t.bob, 'user-bob', shipment.id, silent), null);
    assert.equal(writer.writes.length, 0);
  });
});
