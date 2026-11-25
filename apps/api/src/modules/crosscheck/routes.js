import { Router } from 'express';
import * as core from '@portchimera/core';
import { AppError } from '../../middleware/errorHandler.js';
import { makeParser } from '../shipments/schemas.js';
import { crossCheckHandlers } from './handlers.js';
import { decisionSchema, idSchema } from './schemas.js';

function buildHandlers(logger) {
  return crossCheckHandlers({
    parseId: makeParser(idSchema, AppError),
    parseDecision: makeParser(decisionSchema, AppError),
    engine: core,
    logger,
  });
}

/** Routes under /api/shipments/:shipmentId (run the check, list findings). */
export function shipmentCrossCheckRouter({ logger = console } = {}) {
  const h = buildHandlers(logger);
  const router = Router({ mergeParams: true });
  router.post('/cross-check', h.run);
  router.get('/discrepancies', h.list);
  return router;
}

/** Routes under /api/discrepancies (record a decision). */
export function discrepanciesRouter({ logger = console } = {}) {
  const h = buildHandlers(logger);
  const router = Router();
  router.get('/', h.listAll);
  router.patch('/:id', h.decide);
  return router;
}
