import {
  decideDiscrepancy,
  listAllDiscrepancies,
  listDiscrepancies,
  runCrossCheck,
} from './service.js';

/**
 * Handlers for the cross-check endpoints. Parsers are injected (routes.js passes zod-based
 * ones), so tests run without Express or zod. Ownership comes from req.auth.userId.
 *
 * @param {{parseId: Function, parseDecision: Function, engine: {crossCheck: Function, isCrossCheckStale: Function}, logger?: object}} deps
 */
export function crossCheckHandlers({ parseId, parseDecision, engine, logger = console }) {
  return {
    async run(req, res) {
      const shipmentId = parseId(req.params.shipmentId);
      res.json({ data: await runCrossCheck(req.db, req.auth.userId, shipmentId, engine, logger) });
    },
    async list(req, res) {
      const shipmentId = parseId(req.params.shipmentId);
      res.json({
        data: await listDiscrepancies(req.db, req.auth.userId, shipmentId, engine, logger),
      });
    },
    async listAll(req, res) {
      res.json({ data: await listAllDiscrepancies(req.db, req.auth.userId) });
    },
    async decide(req, res) {
      const id = parseId(req.params.id);
      const { review_status: status } = parseDecision(req.body);
      res.json({ data: await decideDiscrepancy(req.db, req.auth.userId, id, status, logger) });
    },
  };
}
