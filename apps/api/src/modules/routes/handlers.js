import { calculateRoute } from './service.js';

/**
 * POST /api/routes/calculate. The parser and the routing engine are injected by routes.js so
 * this file can be tested without zod or the workspace link.
 *
 * @param {{parseCalculate: Function, engine: object}} deps
 */
export function routeHandlers({ parseCalculate, engine }) {
  return {
    async calculate(req, res) {
      const input = parseCalculate(req.body);
      const result = await calculateRoute(req.db, req.auth.userId, input, engine);
      res.json({ data: result });
    },
  };
}
