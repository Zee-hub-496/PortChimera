import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { AppError, errorHandler } from '../src/middleware/errorHandler.js';

// A tiny fake of Express's `res` object that records what the handler sends.
function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

describe('errorHandler', () => {
  it('returns an AppError with its own status, code and message', () => {
    const res = fakeRes();
    errorHandler({ error: mock.fn() })(new AppError(404, 'NOT_FOUND', 'Nope'), {}, res, () => {});
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: { code: 'NOT_FOUND', message: 'Nope' } });
  });

  it('maps malformed JSON to a 400', () => {
    const res = fakeRes();
    errorHandler({ error: mock.fn() })({ type: 'entity.parse.failed' }, {}, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'INVALID_JSON');
  });

  it('maps oversized bodies to a 413', () => {
    const res = fakeRes();
    errorHandler({ error: mock.fn() })({ type: 'entity.too.large' }, {}, res, () => {});
    assert.equal(res.statusCode, 413);
  });

  it('hides details of unexpected errors but logs them server-side', () => {
    const res = fakeRes();
    const logger = { error: mock.fn() };
    errorHandler(logger)(new Error('db password is hunter2'), {}, res, () => {});
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error.code, 'INTERNAL_ERROR');
    assert.ok(!JSON.stringify(res.body).includes('hunter2'));
    assert.equal(logger.error.mock.callCount(), 1);
  });
});
