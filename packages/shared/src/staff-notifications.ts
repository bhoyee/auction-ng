import { z } from 'zod';
import type { StaffPermission } from './staff-permissions';
/** Alert destinations need their existing read permission as well as action authority. */
export function staffNotificationPermissions(
  permissions: readonly StaffPermission[],
) {
  return permissions.filter((p) =>
    p === 'withdrawals.manage'
      ? permissions.includes('finance.read')
      : p === 'bids.cancel'
        ? permissions.includes('support.manage')
        : p === 'auctions.manage'
          ? permissions.includes('inventory.read')
          : true,
  );
}
export function staffNotificationHref(
  href: string,
  permission: string | null,
  permissions: readonly StaffPermission[],
) {
  return permission === 'auctions.manage'
    ? permissions.includes('pickup.manage')
      ? '/?section=pickup'
      : '/?section=auctions'
    : href;
}
export const staffActivityKinds = [
  'withdrawal.review',
  'bid-cancellation.review',
  'support.open',
  'support.reply',
  'sale.completed',
  'workspace.changed',
] as const;
export const staffActivityKindSchema = z.enum(staffActivityKinds);
export const staffInboxItemSchema = z
  .object({
    id: z.uuid(),
    title: z.string().max(200),
    description: z.string().max(300),
    href: z.string().startsWith('/?section=').max(300),
    createdAt: z.iso.datetime(),
    readAt: z.iso.datetime().nullable(),
    emailStatus: z.enum(['pending', 'sent', 'failed']),
    emailMode: z.enum(['smtp', 'preview', 'off']).default('preview'),
  })
  .strict();
export const staffInboxQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().max(1000).optional(),
  })
  .strict();
export const staffInboxPageSchema = z
  .object({
    items: z.array(staffInboxItemSchema).max(50),
    nextCursor: z.string().nullable(),
    unreadCount: z.number().int().nonnegative(),
    serverTime: z.iso.datetime(),
    emailMode: z.enum(['smtp', 'preview', 'off']).default('preview'),
  })
  .strict();
export const staffInboxReadSchema = z
  .object({ ids: z.array(z.uuid()).min(1).max(50) })
  .strict();
export const staffInboxReadResultSchema = z
  .object({ updated: z.number().int().min(0).max(50) })
  .strict();
export const staffSignalSchema = z
  .object({ userId: z.uuid().nullable() })
  .strict();
export type StaffInboxItem = z.infer<typeof staffInboxItemSchema>;
export type StaffInboxPage = z.infer<typeof staffInboxPageSchema>;
