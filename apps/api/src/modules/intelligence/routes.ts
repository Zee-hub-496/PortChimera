import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AppError } from '../../middleware/errorHandler.js';
import { makeParser } from '../shipments/schemas.js';
import { createEnergyService } from './energyService.ts';
import { intelligenceHandlers } from './handlers.ts';
import { createNewsService } from './newsService.ts';
import type { NewsService } from './newsService.ts';
import type { EnergyService } from './energyService.ts';
import type { FetchLike } from './providerHttp.ts';
import { newsQuerySchema } from './schemas.ts';

export interface IntelligenceRouterOptions {
  env: { EIA_API_KEY?: string | undefined };
  logger?: Console;
  /** Tests inject fakes; production builds the real services. */
  news?: NewsService;
  energy?: EnergyService;
  fetchImpl?: FetchLike;
  rateLimitMax?: number;
}

/** Routes under /api/intelligence. The caller (app.js) puts requireAuth in front of them. */
export function intelligenceRouter({
  env,
  logger = console,
  news,
  energy,
  fetchImpl,
  rateLimitMax = 30,
}: IntelligenceRouterOptions) {
  const doFetch: FetchLike = fetchImpl ?? ((url, init) => fetch(url, init));
  const h = intelligenceHandlers({
    news: news ?? createNewsService({ fetchImpl: doFetch, logger }),
    energy: energy ?? createEnergyService({ apiKey: env.EIA_API_KEY, fetchImpl: doFetch, logger }),
    parseNewsQuery: makeParser(newsQuerySchema, AppError),
  });
  const router = Router();
  // These routes can trigger calls to free external APIs, so they get a stricter limit than /api.
  router.use(
    rateLimit({
      windowMs: 60_000,
      limit: rateLimitMax,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down' } },
    }),
  );
  router.get('/news', h.news);
  router.get('/energy', h.energy);
  return router;
}
