import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OBJECTIVES } from '../../../packages/core/src/index.js';
import { OBJECTIVE_LABELS } from '../src/lib/routeView.js';

describe('web objectives match core', () => {
  it('has a label for exactly the core objectives', () => {
    assert.deepEqual(Object.keys(OBJECTIVE_LABELS).sort(), Object.keys(OBJECTIVES).sort());
  });
});
