// Pure helper for the React error boundary, kept apart from JSX so node can test it.

const MAX_MESSAGE = 300;

/**
 * Turns anything a component threw into a small, loggable object. Code can throw strings,
 * objects or nothing at all, so this never assumes an Error. Only the name and a shortened
 * message are kept; the user never sees them (the screen shows fixed text).
 * @param {unknown} error
 * @returns {{name: string, message: string}}
 */
export function describeCrash(error) {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: String(error.message ?? '').slice(0, MAX_MESSAGE),
    };
  }
  if (typeof error === 'string')
    return { name: 'Thrown string', message: error.slice(0, MAX_MESSAGE) };
  return { name: 'Unknown error', message: '' };
}
