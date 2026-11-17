import { Router } from 'express';
import { getMe } from './handlers.js';

/** Routes under /api/auth. The caller (app.js) puts requireAuth in front of all of them. */
export function authRouter() {
  const router = Router();
  router.get('/me', getMe);
  return router;
}
