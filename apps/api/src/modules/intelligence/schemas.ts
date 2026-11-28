import { z } from 'zod';
import { EVENT_CATEGORIES, REGIONS, SOURCE_CLASSES } from '@portchimera/core/v2';

const REGION_IDS = REGIONS.map((r) => r.id) as [string, ...string[]];

/** Query string of GET /api/intelligence/news. Unknown parameters are rejected. */
export const newsQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    region: z.enum(REGION_IDS).optional(),
    category: z.enum(EVENT_CATEGORIES).optional(),
    sourceClass: z.enum(SOURCE_CLASSES).optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    refresh: z
      .enum(['true', 'false', '1', '0'])
      .optional()
      .transform((v) => v === 'true' || v === '1'),
  })
  .strict();

export type NewsQuery = z.infer<typeof newsQuerySchema>;
