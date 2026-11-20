import { listPorts } from './service.js';

/** GET /api/ports */
export async function list(req, res) {
  res.json({ data: await listPorts(req.db) });
}
