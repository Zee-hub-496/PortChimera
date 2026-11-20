// Pure theme helpers. No DOM access, so node:test can run them.
// index.html contains an inline pre-paint script that mirrors resolveTheme.
export const THEME_KEY = 'portchimera-theme';

export const THEME_CHOICES = Object.freeze(['light', 'dark', 'system']);

/**
 * Returns a valid theme choice, falling back to 'system'.
 * @param {unknown} value
 * @returns {'light'|'dark'|'system'}
 */
export function normalizeChoice(value) {
  return THEME_CHOICES.includes(value) ? value : 'system';
}

/**
 * Turns a choice into the theme that is actually shown.
 * @param {unknown} choice
 * @param {boolean} prefersDark result of the prefers-color-scheme: dark media query
 * @returns {'light'|'dark'}
 */
export function resolveTheme(choice, prefersDark) {
  const c = normalizeChoice(choice);
  if (c === 'system') return prefersDark ? 'dark' : 'light';
  return c;
}

/**
 * Next choice when cycling light -> dark -> system -> light.
 * @param {unknown} choice
 * @returns {'light'|'dark'|'system'}
 */
export function nextChoice(choice) {
  const i = THEME_CHOICES.indexOf(normalizeChoice(choice));
  return THEME_CHOICES[(i + 1) % THEME_CHOICES.length];
}
