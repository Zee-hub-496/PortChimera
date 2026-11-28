import { AppError } from '../../middleware/errorHandler.js';
import { ProviderError } from './providerHttp.ts';
import { NEWS_TTL_MS, filterEvents } from './newsService.ts';
import type { NewsService } from './newsService.ts';
import type { EnergyService } from './energyService.ts';
import { OFFICIAL_SOURCE_LINKS } from './officialLinks.ts';
import type { NewsQuery } from './schemas.ts';
import type { NewsPageResponse } from '@portchimera/core/v2';

// Minimal shapes so handlers can be tested without Express.
interface Req {
  query: unknown;
}
interface Res {
  json(body: unknown): unknown;
}

export interface IntelligenceHandlerDeps {
  news: NewsService;
  energy: EnergyService;
  parseNewsQuery: (input: unknown) => NewsQuery;
}

/** A provider failure with nothing cached becomes a 503 the client can show, not a 500. */
function unavailable(err: unknown): never {
  if (err instanceof ProviderError) {
    throw new AppError(
      503,
      'PROVIDER_UNAVAILABLE',
      'This data source is not available right now. Try again later.',
    );
  }
  throw err;
}

export function intelligenceHandlers({ news, energy, parseNewsQuery }: IntelligenceHandlerDeps) {
  return {
    /** GET /api/intelligence/news */
    async news(req: Req, res: Res) {
      const q = parseNewsQuery(req.query);
      const result = await news.getNews({ force: q.refresh }).catch(unavailable);
      const page = filterEvents(result.events, q);
      const data: NewsPageResponse = {
        ...page,
        meta: {
          fetchedAt: result.fetchedAt,
          ageSeconds: result.ageSeconds,
          ttlSeconds: NEWS_TTL_MS / 1000,
          stale: result.stale,
          lastError: result.lastError,
          refreshThrottled: result.refreshThrottled,
          queriesOk: result.queriesOk,
          queriesFailed: result.queriesFailed,
          dropped: { malformed: result.malformed, irrelevant: result.irrelevant },
          source: 'GDELT DOC 2.0 (news discovery, not real time, not official confirmation)',
          officialLinks: OFFICIAL_SOURCE_LINKS,
        },
      };
      res.json({ data });
    },

    /** GET /api/intelligence/energy */
    async energy(_req: Req, res: Res) {
      const result = await energy.getEnergy().catch(unavailable);
      res.json({ data: result });
    },
  };
}
