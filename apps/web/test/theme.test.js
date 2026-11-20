import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  THEME_KEY,
  THEME_CHOICES,
  normalizeChoice,
  resolveTheme,
  nextChoice,
} from '../src/lib/theme.js';

describe('theme', () => {
  it('uses a stable storage key', () => assert.equal(THEME_KEY, 'portchimera-theme'));
  it('normalizes unknown values to system', () => {
    assert.equal(normalizeChoice('dark'), 'dark');
    assert.equal(normalizeChoice('purple'), 'system');
    assert.equal(normalizeChoice(null), 'system');
  });
  it('resolves system from the media query', () => {
    assert.equal(resolveTheme('system', true), 'dark');
    assert.equal(resolveTheme('system', false), 'light');
  });
  it('ignores the media query for explicit choices', () => {
    assert.equal(resolveTheme('light', true), 'light');
    assert.equal(resolveTheme('dark', false), 'dark');
  });
  it('cycles through every choice', () => {
    assert.deepEqual(
      [nextChoice('light'), nextChoice('dark'), nextChoice('system')],
      ['dark', 'system', 'light'],
    );
    assert.equal(THEME_CHOICES.length, 3);
  });
});
