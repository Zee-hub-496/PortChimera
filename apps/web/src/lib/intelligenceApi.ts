import type { EnergyPayload, NewsPageResponse } from '@portchimera/core/v2';
import { apiGet } from './api.js';
import { buildNewsPath } from './intelligenceView.ts';
import type { NewsFilters } from './intelligenceView.ts';

export function getNews(filters: NewsFilters): Promise<NewsPageResponse> {
  return apiGet(buildNewsPath(filters)) as Promise<NewsPageResponse>;
}

export function getEnergy(): Promise<EnergyPayload> {
  return apiGet('/api/intelligence/energy') as Promise<EnergyPayload>;
}
