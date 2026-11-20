import { Router } from 'express';
import * as core from '@portchimera/core';
import { AppError } from '../../middleware/errorHandler.js';
import { makeParser } from '../shipments/schemas.js';
import { routeHandlers } from './handlers.js';
import { calculateRouteSchema } from './schemas.js';

/** Routes under /api/routes. The caller (app.js) puts requireAuth in front of them. */
export function routesRouter() {
  const h = routeHandlers({
    parseCalculate: makeParser(calculateRouteSchema, AppError),
    engine: core,
  });
  const router = Router();
  router.post('/calculate', h.calculate);
  return router;
}
