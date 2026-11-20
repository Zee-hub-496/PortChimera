import { Router } from 'express';
import { AppError } from '../../middleware/errorHandler.js';
import { shipmentHandlers } from './handlers.js';
import { createShipmentSchema, makeParser, shipmentIdSchema } from './schemas.js';

/** Routes under /api/shipments. The caller (app.js) puts requireAuth in front of all of them. */
export function shipmentsRouter() {
  const h = shipmentHandlers({
    parseCreate: makeParser(createShipmentSchema, AppError),
    parseId: makeParser(shipmentIdSchema, AppError),
  });
  const router = Router();
  router.post('/', h.create);
  router.get('/', h.list);
  router.get('/:id', h.get);
  return router;
}
