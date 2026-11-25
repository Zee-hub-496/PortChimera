import { z } from 'zod';

/** Same list as the database check on scenario_effects.effect_type and core's DISRUPTION_TYPES. */
export const EFFECT_TYPES = [
  'port_strike',
  'severe_weather',
  'port_congestion',
  'connection_failure',
];

/** One effect closes exactly one port (portId) or one directed lane (edgeId). */
export const effectSchema = z
  .object({
    type: z.enum(EFFECT_TYPES),
    portId: z.string().uuid().optional(),
    edgeId: z.string().uuid().optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((v) => (v.portId === undefined) !== (v.edgeId === undefined), {
    message: 'Give either portId or edgeId, not both and not neither',
  });

/** Body of POST /api/scenarios. Unknown fields (such as a user id) are rejected. */
export const createScenarioSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    effects: z.array(effectSchema).max(20).optional(),
  })
  .strict();

/** Body of PATCH /api/scenarios/:id. */
export const updateScenarioSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

/** Body of POST /api/scenarios/:id/simulate. */
export const simulateSchema = z
  .object({
    shipmentId: z.string().uuid(),
    objective: z.enum(['fastest', 'cheapest', 'lowest_risk']).optional(),
  })
  .strict();

/** Path parameters :id and :effectId. */
export const idSchema = z.string().uuid();
