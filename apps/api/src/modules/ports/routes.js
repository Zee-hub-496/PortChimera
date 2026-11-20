import { Router } from 'express';
import { list } from './handlers.js';

/** Routes under /api/ports. The caller (app.js) puts requireAuth in front of them. */
export function portsRouter() {
  const router = Router();
  router.get('/', list);
  return router;
}
