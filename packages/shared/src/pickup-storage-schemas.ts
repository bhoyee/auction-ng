import { z } from 'zod';
import { pickupCalendarSchema } from './pickup-storage-rules';
import { koboSchema } from './kobo-schema';
const command = {
  idempotencyKey: z.uuid(),
  reason: z.string().trim().min(5).max(1000),
};
export const storageErrorCodeSchema = z.enum([
  'PICKUP_STORAGE_POLICY_REQUIRED',
  'PICKUP_STORAGE_NOT_ELIGIBLE',
]);
export const storageCentreSaveSchema = z
  .object({
    ...command,
    locationId: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
    enabled: z.boolean(),
    dailyKobo: koboSchema,
    capKobo: koboSchema,
    calendar: pickupCalendarSchema,
  })
  .strict();
export const storageCentreSchema = z
  .object({
    locationId: z.uuid(),
    location: z.string(),
    enabled: z.boolean(),
    dailyKobo: koboSchema,
    capKobo: koboSchema,
    revision: z.number().int().nonnegative(),
    calendar: pickupCalendarSchema.nullable(),
  })
  .strict();
export const storageReadySchema = z
  .object({
    ...command,
    lineIds: z
      .array(z.uuid())
      .min(1)
      .max(50)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .strict();
export const storageAdjustSchema = z
  .object({
    ...command,
    caseId: z.uuid(),
    expectedRevision: z.number().int().positive(),
    action: z.enum(['extend', 'waive', 'assign', 'contact']),
    dueDate: z.iso.date().optional(),
    assignedToId: z.uuid().nullable().optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.action === 'extend' && !input.dueDate)
      ctx.addIssue({
        code: 'custom',
        message: 'Choose a new due date.',
        path: ['dueDate'],
      });
    if (input.action === 'assign' && input.assignedToId === undefined)
      ctx.addIssue({
        code: 'custom',
        message: 'Choose an assignee or unassign.',
        path: ['assignedToId'],
      });
  });
export const storagePageQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(10),
    cursor: z.uuid().optional(),
    search: z.string().trim().max(120).default(''),
    view: z
      .enum([
        'all',
        'not_started',
        'ready',
        'due_soon',
        'overdue',
        'review',
        'collected',
        'assigned',
      ])
      .default('all'),
  })
  .strict();
export const storageCaseSchema = z
  .object({
    id: z.uuid().nullable(),
    invoiceLineId: z.uuid(),
    lotId: z.uuid(),
    reference: z.string(),
    title: z.string(),
    invoiceNumber: z.string(),
    buyerId: z.uuid(),
    buyerName: z.string(),
    locationId: z.uuid(),
    location: z.string(),
    status: z.enum([
      'not_started',
      'ready',
      'due_soon',
      'overdue',
      'review',
      'collected',
    ]),
    dueAt: z.iso.datetime().nullable(),
    reviewAt: z.iso.datetime().nullable(),
    notifiedAt: z.iso.datetime().nullable(),
    collectedAt: z.iso.datetime().nullable(),
    revision: z.number().int().nonnegative(),
    dailyKobo: koboSchema,
    capKobo: koboSchema,
    days: z.number().int().nonnegative(),
    assessedKobo: koboSchema,
    paidKobo: koboSchema,
    outstandingKobo: koboSchema,
    waived: z.boolean(),
    assignedToId: z.uuid().nullable(),
    assignedToName: z.string().nullable(),
  })
  .strict();
export const storageCasePageSchema = z
  .object({
    items: z.array(storageCaseSchema).max(50),
    nextCursor: z.uuid().nullable(),
    serverTime: z.iso.datetime(),
  })
  .strict();
export const storagePaymentMethodSchema = z.enum([
  'wallet',
  'local_card',
  'international_card',
  'bank_transfer',
]);
export const storagePaymentStartSchema = z
  .object({
    idempotencyKey: z.uuid(),
    caseId: z.uuid(),
    method: storagePaymentMethodSchema,
  })
  .strict();
export const storagePaymentConfirmSchema = z
  .object({
    idempotencyKey: z.uuid(),
    paymentId: z.uuid(),
    consent: z.literal(true),
  })
  .strict();
export const storagePaymentSchema = z
  .object({
    id: z.uuid(),
    caseId: z.uuid(),
    method: storagePaymentMethodSchema,
    status: z.enum(['pending', 'paid', 'expired', 'cancelled', 'review']),
    storageKobo: koboSchema,
    feeKobo: koboSchema,
    amountKobo: koboSchema,
    expiresAt: z.iso.datetime(),
    checkoutUrl: z.url().nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const storageResultSchema = z
  .object({ id: z.string(), message: z.string() })
  .strict();
export const storageExceptionSchema = z
  .object({
    id: z.uuid(),
    caseId: z.uuid(),
    reference: z.string(),
    kind: z.string(),
    status: z.string(),
    createdAt: z.iso.datetime(),
    itemReference: z.string(),
  })
  .strict();
export const storageExceptionPageSchema = z
  .object({
    items: z.array(storageExceptionSchema).max(50),
    nextCursor: z.uuid().nullable(),
  })
  .strict();
export type StorageCase = z.infer<typeof storageCaseSchema>;
export type StorageCasePage = z.infer<typeof storageCasePageSchema>;
export type StorageCentre = z.infer<typeof storageCentreSchema>;
export type StoragePayment = z.infer<typeof storagePaymentSchema>;
export const storageMaintenanceReportSchema = z
  .object({
    reminded: z.number().int().nonnegative(),
    reviewed: z.number().int().nonnegative(),
    reconciled: z.number().int().nonnegative(),
  })
  .strict();
export const storageCentrePageSchema = z
  .object({
    items: z.array(storageCentreSchema).max(50),
    nextCursor: z.uuid().nullable(),
  })
  .strict();
export type StoragePageInput = z.input<typeof storagePageQuerySchema>;
export type StorageCentreInput = z.input<typeof storageCentreSaveSchema>;
export type StorageReadyInput = z.input<typeof storageReadySchema>;
export type StorageAdjustInput = z.input<typeof storageAdjustSchema>;
export type StorageQuoteInput = z.input<typeof storagePaymentStartSchema>;
export type StorageConfirmInput = z.input<typeof storagePaymentConfirmSchema>;
