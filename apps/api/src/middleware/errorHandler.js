/**
 * An error we raised on purpose, safe to show to the client.
 * Anything that is NOT an AppError is treated as a bug and its details stay on the server.
 */
export class AppError extends Error {
  /**
   * @param {number} status HTTP status code
   * @param {string} code short machine-readable code, e.g. "NOT_FOUND"
   * @param {string} message human-readable explanation, safe to expose
   */
  constructor(status, code, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export function notFoundHandler(_req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', 'Route not found'));
}

// Express recognises an error handler by its four parameters, so `_next` must stay.
export function errorHandler(logger = console) {
  return (err, _req, res, _next) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    }
    // Malformed JSON bodies surface from express.json() with a status of 400.
    if (err?.type === 'entity.parse.failed') {
      return res
        .status(400)
        .json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
    }
    if (err?.type === 'entity.too.large') {
      return res
        .status(413)
        .json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
    }
    // Unknown error: log the details server-side, return a generic message to the client.
    logger.error('Unhandled error:', err);
    return res
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
  };
}
