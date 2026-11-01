import { z } from 'zod';
export const PICKUP_PASS_TTL_MS = 10 * 60 * 1000;
export const visitPageInputSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(10),
    cursor: z.uuid().optional(),
  })
  .strict();
export const visitItemPageInputSchema = visitPageInputSchema
  .extend({ itemNumber: z.string().trim().min(1).max(40).optional() })
  .strict();
export const pickupCentreSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    address: z.string(),
    orderCount: z.number().int().nonnegative(),
  })
  .strict();
export const pickupCentrePageSchema = z
  .object({
    items: z.array(pickupCentreSchema).max(50),
    nextCursor: z.uuid().nullable(),
  })
  .strict();
export const prepareVisitPassSchema = z
  .object({ locationId: z.uuid(), renew: z.boolean().default(false) })
  .strict();
export const scanVisitPassSchema = z
  .object({ code: z.string().trim().min(8).max(64) })
  .strict();
export const pickupVisitSchema = z
  .object({
    id: z.uuid(),
    buyerName: z.string(),
    locationId: z.uuid(),
    location: z.string(),
    status: z.enum(['waiting', 'completed', 'cancelled']),
    createdAt: z.iso.datetime(),
    finishedAt: z.iso.datetime().nullable(),
  })
  .strict();
export const pickupVisitPageSchema = z
  .object({
    items: z.array(pickupVisitSchema).max(50),
    nextCursor: z.uuid().nullable(),
  })
  .strict();
export const pickupVisitPassSchema = z
  .object({
    id: z.uuid(),
    token: z.string(),
    code: z.string().length(8),
    expiresAt: z.iso.datetime(),
    serverTime: z.iso.datetime(),
    location: z
      .object({ id: z.uuid(), name: z.string(), address: z.string() })
      .strict(),
    visit: pickupVisitSchema.nullable(),
  })
  .strict();
export const pickupVisitItemSchema = z
  .object({
    id: z.uuid(),
    lotId: z.uuid(),
    itemNumber: z.string(),
    title: z.string(),
    invoiceNumber: z.string(),
  })
  .strict();
export const pickupVisitItemsSchema = z
  .object({
    visit: pickupVisitSchema,
    items: z.array(pickupVisitItemSchema).max(50),
    nextCursor: z.uuid().nullable(),
  })
  .strict();
export const confirmCollectionSchema = z
  .object({
    idempotencyKey: z.uuid(),
    lineIds: z
      .array(z.uuid())
      .min(1)
      .max(50)
      .refine((ids) => new Set(ids).size === ids.length),
    finishVisit: z.boolean().default(true),
  })
  .strict();
export const collectionReceiptSchema = z
  .object({
    id: z.uuid(),
    visitId: z.uuid(),
    lineIds: z.array(z.uuid()).max(50),
    finishVisit: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const cancelVisitSchema = z
  .object({ reason: z.string().trim().min(5).max(300) })
  .strict();
export type PickupVisit = z.infer<typeof pickupVisitSchema>;
export type PickupVisitPass = z.infer<typeof pickupVisitPassSchema>;
export type PickupVisitItems = z.infer<typeof pickupVisitItemsSchema>;
export type CollectionInput = z.infer<typeof confirmCollectionSchema>;
export type PickupCentrePage = z.infer<typeof pickupCentrePageSchema>;
