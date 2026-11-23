import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeCrash } from '../src/lib/crashInfo.js';

describe('describeCrash', () => {
  it('keeps the name and message of an Error', () => {
    assert.deepEqual(describeCrash(new TypeError('x is undefined')), {
      name: 'TypeError',
      message: 'x is undefined',
    });
  });
  it('handles thrown strings, objects, null and undefined without throwing', () => {
    assert.equal(describeCrash('boom').message, 'boom');
    for (const value of [null, undefined, {}, 42]) {
      assert.deepEqual(describeCrash(value), { name: 'Unknown error', message: '' });
    }
  });
  it('shortens very long messages', () => {
    assert.equal(describeCrash(new Error('a'.repeat(5000))).message.length, 300);
    assert.equal(describeCrash('b'.repeat(5000)).message.length, 300);
  });
});
