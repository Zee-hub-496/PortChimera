import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mountProtectedRoutes, PROTECTED_PREFIXES } from '../src/protectedRoutes.js';

const factories = () => ({
  auth: () => 'authRouter',
  shipments: () => 'shipmentsRouter',
  ports: () => 'portsRouter',
  routes: () => 'routesRouter',
  shipmentDocuments: () => 'shipmentDocumentsRouter',
  documents: () => 'documentsRouter',
});

describe('mountProtectedRoutes', () => {
  it('mounts every prefix with protect in front of the router', () => {
    const calls = [];
    const protect = () => {};
    mountProtectedRoutes({ use: (...a) => calls.push(a) }, protect, factories());
    assert.deepEqual(calls.map((c) => c[0]).sort(), Object.values(PROTECTED_PREFIXES).sort());
    for (const [, mw, router] of calls) {
      assert.equal(mw, protect);
      assert.match(router, /Router$/);
    }
    for (const p of [
      '/api/shipments',
      '/api/ports',
      '/api/routes',
      '/api/auth',
      '/api/shipments/:shipmentId/documents',
      '/api/documents',
    ]) {
      assert.ok(
        calls.some((c) => c[0] === p),
        p,
      );
    }
  });

  it('throws when a router is missing or unknown, so nothing is mounted unprotected', () => {
    const app = { use() {} };
    const { ports, ...missing } = factories();
    assert.throws(() => mountProtectedRoutes(app, () => {}, missing), /ports/);
    assert.throws(
      () => mountProtectedRoutes(app, () => {}, { ...factories(), extra: () => 1 }),
      /extra/,
    );
  });
});
