/**
 * Thrown when the caller gives the cross-checker unusable input (fewer than two documents,
 * unknown document types). Mismatches between documents are NOT errors: they are the result.
 */
export class CrossCheckInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CrossCheckInputError';
    this.code = 'INVALID_CROSSCHECK_INPUT';
  }
}
