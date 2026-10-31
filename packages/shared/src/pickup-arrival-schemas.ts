import { z } from 'zod';
export const arrivalStatuses = [
  'waiting',
  'acknowledged',
  'closed',
  'cancelled',
] as const;
export const arrivalInputSchema = z
  .object({ invoiceId: z.uuid(), idempotencyKey: z.uuid() })
  .strict();
export const arrivalUpdateSchema = z
  .object({
    status: z.enum(['acknowledged', 'closed']),
    expectedStatus: z.enum(arrivalStatuses),
  })
  .strict();
export const arrivalPageInputSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(10),
    cursor: z.uuid().optional(),
  })
  .strict();
export const arrivalSchema = z
  .object({
    id: z.uuid(),
    invoiceId: z.uuid(),
    invoiceNumber: z.string(),
    buyerName: z.string(),
    location: z.string(),
    status: z.enum(arrivalStatuses),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const arrivalPageSchema = z
  .object({
    items: z.array(arrivalSchema).max(50),
    nextCursor: z.uuid().nullable(),
  })
  .strict();
export type PickupArrival = z.infer<typeof arrivalSchema>;

export type PickupArrivalInput = z.infer<typeof arrivalInputSchema>;
export type PickupArrivalUpdate = z.infer<typeof arrivalUpdateSchema>;

export const pickupArrivalRateLimits = {
  buyer: 20,
  staff: 300,
  ip: 1000,
} as const;
