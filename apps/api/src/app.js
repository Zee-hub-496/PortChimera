import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requireAuth } from './middleware/requireAuth.js';
import { authRouter } from './modules/auth/routes.js';
import { shipmentsRouter } from './modules/shipments/routes.js';
import { portsRouter } from './modules/ports/routes.js';
import { routesRouter } from './modules/routes/routes.js';

/**
 * Builds the Express app without starting a server. Keeping "build" separate from "listen"
 * lets tests call the app directly with no network port.
 *
 * Response contract used everywhere: success -> { data }, failure -> { error: { code, message } }.
 *
 * @param {ReturnType<import('./config/env.js').loadEnv>} env
 * @param {object} [deps]
 * @param {{verifyToken: Function, createDb: Function} | null} [deps.auth] how to check sign-ins
 *   and build per-user database clients. When it is missing, NO protected routes are mounted
 *   (the app cannot accidentally serve them without a sign-in check).
 */
export function createApp(env, { logger = console, auth = null } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json({ limit: '1mb' }));

  // Basic abuse protection. Stricter limits will be added on AI and upload routes.
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down' } },
    }),
  );

  app.get('/api/health', (_req, res) => {
    res.json({ data: { status: 'ok', service: 'portchimera-api' } });
  });

  // Everything below this point requires a valid sign-in. Add each new module's router here,
  // behind `protect`, never above it.
  if (auth) {
    const protect = requireAuth({ ...auth, logger });
    app.use('/api/auth', protect, authRouter());
    app.use('/api/shipments', protect, shipmentsRouter());
    app.use('/api/ports', protect, portsRouter());
    app.use('/api/routes', protect, routesRouter());
  }

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
}
