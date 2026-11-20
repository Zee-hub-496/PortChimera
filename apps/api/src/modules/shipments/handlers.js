import { AppError } from '../../middleware/errorHandler.js';
import { createShipment, getShipment, listShipments } from './service.js';

/**
 * Express handlers for /api/shipments. Parsers are injected (routes.js passes zod-based ones),
 * so this file and the service can be tested without zod or Express installed.
 *
 * Ownership always comes from req.auth.userId, never from the body or URL.
 *
 * @param {{parseCreate: Function, parseId: Function}} parsers
 */
export function shipmentHandlers({ parseCreate, parseId }) {
  return {
    async create(req, res) {
      const input = parseCreate(req.body);
      const shipment = await createShipment(req.db, req.auth.userId, input);
      res.status(201).json({ data: shipment });
    },
    async list(req, res) {
      res.json({ data: await listShipments(req.db, req.auth.userId) });
    },
    async get(req, res) {
      const id = parseId(req.params.id);
      const shipment = await getShipment(req.db, req.auth.userId, id);
      if (!shipment) throw new AppError(404, 'SHIPMENT_NOT_FOUND', 'Shipment not found');
      res.json({ data: shipment });
    },
  };
}
