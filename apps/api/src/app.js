import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requireAuth } from './middleware/requireAuth.js';
import { mountProtectedRoutes } from './protectedRoutes.js';
import { authRouter } from './modules/auth/routes.js';
import { shipmentsRouter } from './modules/shipments/routes.js';
import { portsRouter } from './modules/ports/routes.js';
import { routesRouter } from './modules/routes/routes.js';
import { documentsRouter, shipmentDocumentsRouter } from './modules/documents/routes.js';
import { discrepanciesRouter, shipmentCrossCheckRouter } from './modules/crosscheck/routes.js';

/**
 * Builds the Express app without starting a server. Keeping "build" separate from "listen"
 * lets tests call the app directly with no network port.
 *
 * Response contract used everywhere: success -> { data }, failure -> { error: { code, message } }.
 *
 * @param {ReturnType<import('./config/env.js').loadEnv>} env
 * @param {object} [deps]
 * @param {number} [deps.rateLimitMax] requests per minute per client IP on /api (tests lower it)
 * @param {{verifyToken: Function, createDb: Function} | null} [deps.auth] how to check sign-ins
 *   and build per-user database clients. When it is missing, NO protected routes are mounted
 *   (the app cannot accidentally serve them without a sign-in check).
 */
export function createApp(env, { logger = console, auth = null, rateLimitMax = 120 } = {}) {
  const app = express();

  // Behind Render (and Vercel rewrites) the socket address is the proxy, so without this every
  // user would share one rate-limit bucket. Trust exactly N hops, never `true`, so a client
  // cannot choose its own IP by sending an X-Forwarded-For header.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json({ limit: '1mb' }));

  // Basic abuse protection. Upload and AI routes add a stricter limit of their own.
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: rateLimitMax,
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
    mountProtectedRoutes(app, protect, {
      auth: authRouter,
      shipments: shipmentsRouter,
      ports: portsRouter,
      routes: routesRouter,
      shipmentDocuments: () => shipmentDocumentsRouter({ env, logger }),
      documents: () => documentsRouter({ env, logger }),
      shipmentCrossCheck: () => shipmentCrossCheckRouter({ logger }),
      discrepancies: () => discrepanciesRouter({ logger }),
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
}
