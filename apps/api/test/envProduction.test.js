import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadEnv } from '../src/config/env.js';

// Needs Zod (npm install), so it runs on your machine, not in the authoring sandbox.

const complete = {
  NODE_ENV: 'production',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key-for-tests',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key-for-tests',
  CORS_ORIGIN: 'https://portchimera.example.test',
};

describe('loadEnv in production', () => {
  it('accepts a complete configuration', () => {
    assert.equal(loadEnv(complete).NODE_ENV, 'production');
  });

  it('names every missing required variable, and no values', () => {
    assert.throws(
      () => loadEnv({ NODE_ENV: 'production', SUPABASE_ANON_KEY: 'super-secret-anon' }),
      (err) =>
        /SUPABASE_URL/.test(err.message) &&
        /CORS_ORIGIN/.test(err.message) &&
        !/SUPABASE_ANON_KEY/.test(err.message) &&
        !err.message.includes('super-secret-anon'),
    );
  });

  it('requires the service-role key, and does not print it', () => {
    const { SUPABASE_SERVICE_ROLE_KEY: _omitted, ...without } = complete;
    assert.throws(
      () => loadEnv(without),
      (err) => /SUPABASE_SERVICE_ROLE_KEY/.test(err.message),
    );
  });

  it('does not accept the localhost default for CORS in production', () => {
    const { CORS_ORIGIN: _omitted, ...withoutCors } = complete;
    assert.throws(() => loadEnv(withoutCors), /CORS_ORIGIN/);
  });

  it('does not require them in development or test', () => {
    assert.doesNotThrow(() => loadEnv({ NODE_ENV: 'development' }));
    assert.doesNotThrow(() => loadEnv({ NODE_ENV: 'test' }));
  });
});
