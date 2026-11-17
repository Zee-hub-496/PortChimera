import { AppError } from './errorHandler.js';

/**
 * Builds the middleware that blocks any request without a valid sign-in.
 *
 * Both dependencies are passed in, not imported. In production they talk to Supabase; in tests they
 * are fakes, so the security rules below can be tested without a network or a real project.
 *
 * What a request that passes gets:
 *   req.auth = { userId, email }   who is calling (the token itself is NOT stored here, so it
 *                                  cannot end up in a log line by accident)
 *   req.db                         a database client that acts AS THAT USER, so Row Level Security
 *                                  applies. Route code must use req.db for user data, never an
 *                                  admin client.
 *
 * @param {object} deps
 * @param {(token: string) => Promise<{id: string, email?: string} | null>} deps.verifyToken
 *   returns the user, or null when the token is invalid or expired. Throws if the sign-in
 *   service itself cannot be reached.
 * @param {(token: string) => object} deps.createDb builds a database client for that user's token
 * @param {{error: Function}} [deps.logger]
 */
export function requireAuth({ verifyToken, createDb, logger = console }) {
  if (typeof verifyToken !== 'function' || typeof createDb !== 'function') {
    throw new TypeError('requireAuth needs verifyToken and createDb functions');
  }

  return async function authenticate(req, _res, next) {
    // Exactly "Bearer <token>": one token, no spaces inside it.
    const match = (req.get('authorization') ?? '').match(/^Bearer\s+(\S+)$/i);
    if (!match) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in required');
    const token = match[1];

    let user;
    try {
      user = await verifyToken(token);
    } catch (err) {
      // The sign-in service is down or unreachable. That is not the caller's fault, so it
      // must not look like "your token is bad" (which would sign people out for nothing).
      logger.error('Token verification service failed:', err?.message ?? 'unknown error');
      throw new AppError(
        503,
        'AUTH_UNAVAILABLE',
        'The sign-in service is unavailable. Try again shortly.',
      );
    }

    if (!user || typeof user.id !== 'string' || user.id === '') {
      throw new AppError(401, 'UNAUTHENTICATED', 'Your session is invalid or has expired');
    }

    req.auth = Object.freeze({ userId: user.id, email: user.email ?? null });
    req.db = createDb(token);
    next();
  };
}
