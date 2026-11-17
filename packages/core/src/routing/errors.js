/**
 * Thrown when the caller gives the routing engine bad input (unknown port, invalid weights,
 * a malformed graph). It is NOT used for "no route exists": that is a normal answer and is
 * returned as `{ status: 'no_route' }`.
 *
 * core must not depend on Express, so the API layer is responsible for turning this into a 400.
 */
export class RoutingInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RoutingInputError';
    this.code = 'INVALID_ROUTING_INPUT';
  }
}
