import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateSignupForm, describeSignupError } from '../src/lib/signupForm.js';

const ok = { email: ' a@b.co ', password: 'longenough', confirm: 'longenough' };

describe('validateSignupForm', () => {
  it('accepts and trims the email', () => {
    const r = validateSignupForm(ok);
    assert.equal(r.valid, true);
    assert.deepEqual(r.value, { email: 'a@b.co', password: 'longenough' });
  });
  it('rejects bad email, short password and mismatch', () => {
    assert.ok(validateSignupForm({ ...ok, email: 'nope' }).errors.email);
    assert.ok(validateSignupForm({ ...ok, email: '' }).errors.email);
    assert.ok(validateSignupForm({ ...ok, password: 'short', confirm: 'short' }).errors.password);
    assert.ok(validateSignupForm({ ...ok, confirm: 'other' }).errors.confirm);
  });
  it('handles missing input', () => assert.equal(validateSignupForm().valid, false));
});

describe('describeSignupError', () => {
  it('explains known cases', () => {
    assert.match(describeSignupError({ message: 'User already registered' }), /already exists/);
    assert.match(
      describeSignupError({ code: 'over_request_rate_limit', message: 'rate limit' }),
      /Too many/,
    );
    assert.match(describeSignupError({ message: 'Password should be longer' }), /password/i);
  });
  it('falls back safely', () => {
    assert.match(describeSignupError(null), /Could not create/);
    assert.equal(describeSignupError({ message: 'Odd thing' }), 'Odd thing');
  });
});
