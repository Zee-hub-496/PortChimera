import { getNetwork, listPorts } from './service.js';

/** GET /api/ports */
export async function list(req, res) {
  res.json({ data: await listPorts(req.db) });
}

/** GET /api/ports/network */
export async function network(req, res) {
  res.json({ data: await getNetwork(req.db) });
}
