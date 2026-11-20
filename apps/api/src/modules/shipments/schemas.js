import { z } from 'zod';

/** Incoterms allowed by the database check on shipments.incoterm. */
export const INCOTERMS = [
  'EXW',
  'FCA',
  'FAS',
  'FOB',
  'CFR',
  'CIF',
  'CPT',
  'CIP',
  'DAP',
  'DPU',
  'DDP',
];

const portCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{5}$/, 'Use a 5-letter UN/LOCODE such as CNSHA');

/** Body of POST /api/shipments. `.strict()` rejects any field not listed here. */
export const createShipmentSchema = z
  .object({
    shipmentNumber: z.string().trim().min(1).max(64),
    originPortCode: portCode,
    destinationPortCode: portCode,
    incoterm: z.enum(INCOTERMS).optional(),
  })
  .strict();

/** Path parameter :id. */
export const shipmentIdSchema = z.string().uuid();

/**
 * Turns a zod schema into a plain `(input) => value` parser that throws our AppError (422) with
 * a short message. Handlers receive these parsers so they never import zod themselves.
 */
export function makeParser(schema, AppError) {
  return (input) => {
    const result = schema.safeParse(input);
    if (!result.success) {
      const first = result.error.issues[0];
      const where = first?.path?.length ? `${first.path.join('.')}: ` : '';
      throw new AppError(422, 'VALIDATION_ERROR', `${where}${first?.message ?? 'Invalid input'}`);
    }
    return result.data;
  };
}
