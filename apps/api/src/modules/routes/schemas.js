import { z } from 'zod';

/** Body of POST /api/routes/calculate. Strict: unknown fields (like a user id) are rejected. */
export const calculateRouteSchema = z
  .object({
    shipmentId: z.string().uuid(),
    objective: z.enum(['fastest', 'cheapest', 'lowest_risk']).optional(),
  })
  .strict();
