import { z } from 'zod';

export const idSchema = z.string().uuid();

/** A person can accept, resolve or dismiss a discrepancy. "open" is only ever set by the check. */
export const DECISIONS = ['accepted', 'resolved', 'dismissed'];

export const decisionSchema = z.object({ review_status: z.enum(DECISIONS) }).strict();
