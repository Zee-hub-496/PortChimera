import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { recordAudit } from '../src/modules/audit/service.js';
import { AppError } from '../src/middleware/errorHandler.js';
import { fakeDbFactory } from './helpers/fakes.js';

describe('recordAudit', () => {
  it('writes one row with the caller, shipment, action and details', async () => {
    const factory = fakeDbFactory();
    await recordAudit(factory.createDb('alice-token'), {
      userId: 'user-alice',
      shipmentId: 'ship-1',
      action: 'document.uploaded',
      details: { documentType: 'packing_list' },
    });
    assert.deepEqual(factory.inserts, [
      {
        actingAs: 'user-alice',
        table: 'audit_logs',
        row: {
          user_id: 'user-alice',
          shipment_id: 'ship-1',
          action: 'document.uploaded',
          details: { documentType: 'packing_list' },
        },
      },
    ]);
  });

  it('defaults shipment to null and details to an empty object, and trims the action', async () => {
    const factory = fakeDbFactory();
    await recordAudit(factory.createDb('alice-token'), {
      userId: 'user-alice',
      action: '  user.signed_in ',
    });
    assert.deepEqual(factory.inserts[0].row, {
      user_id: 'user-alice',
      shipment_id: null,
      action: 'user.signed_in',
      details: {},
    });
  });

  it("writes through the caller's own database client, never an admin one", async () => {
    const factory = fakeDbFactory();
    await recordAudit(factory.createDb('bob-token'), { userId: 'user-bob', action: 'x' });
    assert.equal(factory.inserts[0].actingAs, 'user-bob');
  });

  it('throws when the write fails, with no database details in the message', async () => {
    const factory = fakeDbFactory();
    factory.failNextWith({ message: 'permission denied for table audit_logs' });
    await assert.rejects(
      recordAudit(factory.createDb('alice-token'), { userId: 'user-alice', action: 'x' }),
      (err) =>
        err instanceof AppError &&
        err.code === 'AUDIT_WRITE_FAILED' &&
        !/permission|audit_logs/.test(err.message),
    );
  });

  it('rejects an entry without a user, without an action, or with details that are not an object', async () => {
    const db = fakeDbFactory().createDb('alice-token');
    await assert.rejects(recordAudit(db, { action: 'x' }), TypeError);
    await assert.rejects(recordAudit(db, { userId: '', action: 'x' }), TypeError);
    await assert.rejects(recordAudit(db, { userId: 'u' }), TypeError);
    await assert.rejects(recordAudit(db, { userId: 'u', action: '   ' }), TypeError);
    await assert.rejects(recordAudit(db, { userId: 'u', action: 'x', details: [] }), TypeError);
    await assert.rejects(recordAudit(db, { userId: 'u', action: 'x', details: null }), TypeError);
    await assert.rejects(recordAudit(db, { userId: 'u', action: 'x', details: 'text' }), TypeError);
  });
});
