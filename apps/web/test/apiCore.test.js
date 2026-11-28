import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, buildHeaders, parseEnvelope } from '../src/lib/apiCore.js';

describe('buildHeaders', () => {
  it('adds the Bearer token when there is one', () => {
    assert.equal(buildHeaders('abc').Authorization, 'Bearer abc');
  });
  it('omits Authorization without a token', () => {
    assert.equal('Authorization' in buildHeaders(undefined), false);
  });
  it('sets Content-Type only when there is a body', () => {
    assert.equal(buildHeaders('t', true)['Content-Type'], 'application/json');
    assert.equal('Content-Type' in buildHeaders('t', false), false);
  });
});

describe('parseEnvelope', () => {
  it('returns data on success', () => {
    assert.deepEqual(parseEnvelope(200, { data: { a: 1 } }), { a: 1 });
    assert.deepEqual(parseEnvelope(201, { data: [] }), []);
  });
  it('throws ApiError with status and code from the envelope', () => {
    assert.throws(
      () =>
        parseEnvelope(404, {
          error: { code: 'SHIPMENT_NOT_FOUND', message: 'Shipment not found' },
        }),
      (e) =>
        e instanceof ApiError &&
        e.status === 404 &&
        e.code === 'SHIPMENT_NOT_FOUND' &&
        e.message === 'Shipment not found',
    );
  });
  it('falls back to a generic error when the body is not an envelope', () => {
    assert.throws(
      () => parseEnvelope(502, null),
      (e) => e.status === 502 && e.code === 'REQUEST_FAILED' && /502/.test(e.message),
    );
  });
});

describe('healthUrl', () => {
  it('builds the health URL and tolerates a trailing slash or an empty base', async () => {
    const { healthUrl } = await import('../src/lib/apiCore.js');
    assert.equal(healthUrl('https://api.example.test'), 'https://api.example.test/api/health');
    assert.equal(healthUrl('https://api.example.test/'), 'https://api.example.test/api/health');
    assert.equal(healthUrl(''), '/api/health');
    assert.equal(healthUrl(undefined), '/api/health');
  });
});
