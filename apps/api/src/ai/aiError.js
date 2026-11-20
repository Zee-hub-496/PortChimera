/**
 * Failure from an AI provider. `kind` says what went wrong and `message` is always safe to
 * show or log: it never contains an API key, a request URL with credentials or document text.
 * kind: timeout | rate_limited | upstream | bad_output | auth
 */
export class AiError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = 'AiError';
    this.kind = kind;
  }
}
