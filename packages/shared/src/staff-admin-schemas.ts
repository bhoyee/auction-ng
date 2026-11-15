import { z } from 'zod';
import { STAFF_PERMISSIONS } from './staff-permissions';
import { emailSchema } from './auth-session-schemas';
import {
  catalogueImageSchema,
  createLotInputSchema,
} from './catalogue-schemas';
import { koboSchema } from './kobo-schema';
import { staffPasswordSchema } from './staff-auth-schemas';
export const staffPermissionSchema = z.enum(STAFF_PERMISSIONS);
export const staffAccessSchema = z
  .object({
    name: z.string(),
    roleName: z.string(),
    permissions: z.array(staffPermissionSchema),
  })
  .strict();
const reason = z.string().trim().min(5).max(1000);
const command = { idempotencyKey: z.uuid(), reason };
export const staffRoleSaveSchema = z
  .object({
    ...command,
    id: z.uuid().optional(),
    name: z.string().trim().min(2).max(80),
    permissions: z.array(staffPermissionSchema).max(STAFF_PERMISSIONS.length),
    expectedRevision: z.number().int().positive().optional(),
  })
  .strict();
export const staffInviteSchema = z
  .object({
    ...command,
    name: z.string().trim().min(2).max(120),
    email: emailSchema,
    roleId: z.uuid(),
  })
  .strict();
export const staffAssignmentSchema = z
  .object({
    ...command,
    id: z.uuid(),
    roleId: z.uuid(),
    expectedUpdatedAt: z.iso.datetime(),
  })
  .strict();
export const staffArchiveSchema = z
  .object({
    ...command,
    entity: z.enum(['lot', 'user', 'role']),
    id: z.uuid(),
    operation: z.enum(['archive', 'restore', 'purge']),
    expectedUpdatedAt: z.iso.datetime(),
  })
  .strict();
export const staffBuyerActionSchema = z
  .object({
    ...command,
    id: z.uuid(),
    operation: z.enum(['suspend', 'activate', 'strike']),
    expectedUpdatedAt: z.iso.datetime(),
  })
  .strict();
export const staffRefundSchema = z
  .object({ ...command, invoiceId: z.uuid() })
  .strict();
export const staffCsvSchema = z
  .object({ ...command, rows: z.array(createLotInputSchema).min(1).max(50) })
  .strict();
export const staffEnrollmentStartSchema = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();
export const staffEnrollmentFinishSchema = staffEnrollmentStartSchema
  .extend({
    password: staffPasswordSchema,
  })
  .strict();
export const staffEnrollmentSchema = z
  .object({
    email: emailSchema,
    name: z.string(),
  })
  .strict();
export const staffMutationResultSchema = z
  .object({
    id: z.string(),
    message: z.string(),
    invitationToken: z.string().optional(),
  })
  .strict();
export const staffRecordQuerySchema = z
  .object({
    kind: z.enum([
      'lots',
      'buyers',
      'staff',
      'roles',
      'invoices',
      'withdrawals',
      'audit',
    ]),
    view: z.enum(['active', 'archived']).default('active'),
    status: z.string().max(32).optional(),
    search: z.string().trim().max(120).optional(),
    // Lots only: filter by pickup location and bin ("none" = no bin yet).
    location: z.uuid().optional(),
    bin: z.union([z.uuid(), z.literal('none')]).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().max(1000).optional(),
  })
  .strict();
export const staffRowSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    reference: z.string(),
    status: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    detail: z.string(),
    amountKobo: koboSchema.optional(),
    roleId: z.string().optional(),
    permissions: z.array(staffPermissionSchema).optional(),
    revision: z.number().int().optional(),
    imageUrl: z.string().nullable().optional(),
    condition: z.string().optional(),
    // Lots only: the bin code, or null when the lot has no bin yet.
    bin: z.string().nullable().optional(),
  })
  .strict();
export const staffRecordPageSchema = z
  .object({
    items: z.array(staffRowSchema).max(50),
    nextCursor: z.string().nullable(),
  })
  .strict();
export const staffDashboardSchema = z
  .object({
    serverTime: z.iso.datetime(),
    metrics: z.object({
      live: z.number().int().nonnegative(),
      scheduled: z.number().int().nonnegative(),
      drafts: z.number().int().nonnegative(),
      pickup: z.number().int().nonnegative(),
      support: z.number().int().nonnegative(),
      paidSalesKobo: koboSchema,
      refundsKobo: koboSchema,
      paidOrders: z.number().int().nonnegative(),
    }),
    sales: z
      .array(
        z.object({
          day: z.string(),
          amountKobo: koboSchema,
          count: z.number().int(),
        }),
      )
      .max(31),
    lots: z
      .array(z.object({ status: z.string(), count: z.number().int() }))
      .max(20),
  })
  .strict();
export type StaffRecordQuery = z.input<typeof staffRecordQuerySchema>;
export type StaffRow = z.infer<typeof staffRowSchema>;
export type StaffDashboard = z.infer<typeof staffDashboardSchema>;

export const staffImagesSchema = z
  .object({ items: z.array(catalogueImageSchema).max(20) })
  .strict();

export const staffIdSchema = z.uuid();
export type StaffRoleSave = z.input<typeof staffRoleSaveSchema>;
export type StaffInvite = z.input<typeof staffInviteSchema>;
export type StaffAssignment = z.input<typeof staffAssignmentSchema>;
export type StaffArchive = z.input<typeof staffArchiveSchema>;
export type StaffBuyerAction = z.input<typeof staffBuyerActionSchema>;
export type StaffRefund = z.input<typeof staffRefundSchema>;
export type StaffCsv = z.input<typeof staffCsvSchema>;
export type StaffEnrollmentFinish = z.input<typeof staffEnrollmentFinishSchema>;
