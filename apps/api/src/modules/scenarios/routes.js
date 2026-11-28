import { Router } from 'express';
import * as core from '@portchimera/core';
import { AppError } from '../../middleware/errorHandler.js';
import { makeParser } from '../shipments/schemas.js';
import { scenarioHandlers } from './handlers.js';
import {
  createScenarioSchema,
  effectSchema,
  idSchema,
  simulateSchema,
  updateScenarioSchema,
} from './schemas.js';

/** Routes under /api/scenarios. The caller (app.js) puts requireAuth in front of them. */
export function scenariosRouter({ logger = console } = {}) {
  const h = scenarioHandlers({
    parsers: {
      id: makeParser(idSchema, AppError),
      create: makeParser(createScenarioSchema, AppError),
      update: makeParser(updateScenarioSchema, AppError),
      effect: makeParser(effectSchema, AppError),
      simulate: makeParser(simulateSchema, AppError),
    },
    engine: core,
    logger,
  });
  const router = Router();
  router.post('/', h.create);
  router.get('/', h.list);
  // Must stay above '/:id', or "impact" would be read as a scenario id.
  router.get('/impact', h.impact);
  router.get('/:id', h.get);
  router.patch('/:id', h.update);
  router.delete('/:id', h.remove);
  router.post('/:id/effects', h.addEffect);
  router.delete('/:id/effects/:effectId', h.removeEffect);
  router.post('/:id/simulate', h.simulate);
  return router;
}
