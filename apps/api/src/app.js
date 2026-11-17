import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

/**
 * Builds the Express app without starting a server. Keeping "build" separate from "listen"
 * lets tests call the app directly with no network port.
 *
 * Response contract used everywhere: success -> { data }, failure -> { error: { code, message } }.
 *
 * @param {ReturnType<import('./config/env.js').loadEnv>} env
 */
export function createApp(env, { logger = console } = {}) {
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

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
}
