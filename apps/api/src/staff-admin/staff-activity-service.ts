import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { createClient } from 'redis';
import { z } from 'zod';
import {
  BID_STREAM_NAMESPACE,
  staffPermissionsFor,
  staffNotificationPermissions,
  staffNotificationHref,
  staffInboxQuerySchema,
  staffInboxPageSchema,
  staffInboxReadSchema,
  type StaffPermission,
} from '@auction-ng/shared';
import type { AuthIdentity } from '../auth/auth-service';
import type { LedgerService } from '../ledger/ledger-service';
import type { Prisma } from '../generated/prisma/client';
import { staffAccess } from '../auth/staff-access';
import { encryptPii, decryptPii, hashPii } from '../security/pii';
type Tx = Prisma.TransactionClient;
export const staffNoticeMessageSchema = z
  .object({
    title: z.string().max(200),
    description: z.string().max(300),
    href: z.string().startsWith('/?section=').max(300),
  })
  .strict();
export const staffEmailMode = () =>
  process.env.AUTH_MODE === 'smtp'
    ? 'smtp'
    : process.env.AUTH_MODE === 'local'
      ? 'preview'
      : 'off';
const noticePayloadSchema = z
  .object({
    emailCiphertext: z.string().nullable(),
    message: staffNoticeMessageSchema,
    deliveryMode: z.enum(['smtp', 'preview', 'off']).optional(),
  })
  .strict();
const cursorSchema = z
  .object({ at: z.iso.datetime(), id: z.uuid(), scope: z.string() })
  .strict();
export class StaffActivityService {
  constructor(private readonly ledger: LedgerService) {}
  private async access(tx: Tx, who: AuthIdentity) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(715,1)`;
    const a = await staffAccess(tx, who.user.id);
    if (!a.permissions.length) throw new ForbiddenException();
    return { ...a, permissions: staffNotificationPermissions(a.permissions) };
  }
  async inbox(who: AuthIdentity, input: unknown) {
    const v = staffInboxQuerySchema.parse(input);
    return this.ledger.db.$transaction(async (tx) => {
      const a = await this.access(tx, who),
        scope = hashPii(
          who.user.id + ':' + a.permissions.slice().sort().join(','),
          'staff-inbox',
        );
      let anchor: z.infer<typeof cursorSchema> | undefined;
      if (v.cursor) {
        try {
          anchor = cursorSchema.parse(
            JSON.parse(Buffer.from(v.cursor, 'base64url').toString()),
          );
          if (anchor.scope !== scope) throw Error();
        } catch {
          throw new BadRequestException('Reload your notification list.');
        }
      }
      const where: Prisma.NotificationWhereInput = {
        userId: who.user.id,
        template: 'staff-activity-v1',
        staffPermission: { in: a.permissions },
      };
      const [rows, unreadCount] = await Promise.all([
        tx.notification.findMany({
          where: {
            ...where,
            ...(anchor
              ? {
                  OR: [
                    { createdAt: { lt: new Date(anchor.at) } },
                    { createdAt: new Date(anchor.at), id: { lt: anchor.id } },
                  ],
                }
              : {}),
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: v.limit + 1,
        }),
        tx.notification.count({ where: { ...where, readAt: null } }),
      ]);
      const items = rows.slice(0, v.limit).map((r) => {
        const payload = noticePayloadSchema.parse(
          JSON.parse(
            decryptPii(Buffer.from(r.payloadCiphertext), 'notification'),
          ),
        );
        return {
          ...payload.message,
          href: staffNotificationHref(
            payload.message.href,
            r.staffPermission,
            a.permissions,
          ),
          id: r.id,
          createdAt: r.createdAt.toISOString(),
          readAt: r.readAt?.toISOString() ?? null,
          emailStatus: r.status,
          emailMode: payload.deliveryMode ?? staffEmailMode(),
        };
      });
      const last = rows.slice(0, v.limit).at(-1);
      return staffInboxPageSchema.parse({
        items,
        unreadCount,
        serverTime: new Date().toISOString(),
        emailMode: staffEmailMode(),
        nextCursor:
          rows.length > v.limit && last
            ? Buffer.from(
                JSON.stringify({
                  at: last.createdAt.toISOString(),
                  id: last.id,
                  scope,
                }),
              ).toString('base64url')
            : null,
      });
    });
  }
  async read(who: AuthIdentity, input: unknown) {
    const v = staffInboxReadSchema.parse(input);
    return this.ledger.db.$transaction(async (tx) => {
      const a = await this.access(tx, who);
      const result = await tx.notification.updateMany({
        where: {
          id: { in: v.ids },
          userId: who.user.id,
          template: 'staff-activity-v1',
          staffPermission: { in: a.permissions },
          readAt: null,
        },
        data: { readAt: new Date() },
      });
      if (result.count)
        await tx.auditLog.create({
          data: {
            actorId: who.user.id,
            action: 'staff.notifications_read',
            entityType: 'notifications',
            entityId: who.user.id,
            afterCiphertext: encryptPii(
              JSON.stringify({ updated: result.count }),
              'audit',
            ),
          },
        });
      return { updated: result.count };
    });
  }
  private async describe(
    tx: Tx,
    kind: string,
    id: string,
  ): Promise<
    | {
        permission: StaffPermission;
        message: z.infer<typeof staffNoticeMessageSchema>;
      }
    | undefined
  > {
    if (kind === 'withdrawal.review') {
      const r = await tx.withdrawal.findUnique({
        where: { id },
        select: { reference: true, status: true },
      });
      if (!r || r.status !== 'review') return;
      return {
        permission: 'withdrawals.manage',
        message: {
          title: 'Withdrawal awaiting approval',
          description: r.reference + ' needs a review before it can proceed.',
          href:
            '/?section=finance&tab=withdrawals' +
            (r.reference.length <= 120
              ? '&search=' + encodeURIComponent(r.reference)
              : ''),
        },
      };
    }
    if (kind === 'sale.completed') {
      const r = await tx.invoice.findUnique({
        where: { id },
        select: {
          number: true,
          status: true,
          purchase: { select: { id: true } },
        },
      });
      if (!r || r.status !== 'paid') return;
      return {
        permission: 'auctions.manage',
        message: {
          title: r.purchase
            ? 'Buy Now purchase completed'
            : 'Auction won and paid',
          description:
            'Order ' + r.number + ' is ready for the collection workflow.',
          href: '/?section=auctions',
        },
      };
    }
    const r = await tx.supportConversation.findUnique({
      where: { id },
      select: {
        number: true,
        status: true,
        mode: true,
        bidCancellationFeeConsentAt: true,
      },
    });
    if (!r || r.status === 'resolved' || r.mode !== 'human') return;
    if (kind === 'support.open' && r.bidCancellationFeeConsentAt) return;
    const review = kind === 'bid-cancellation.review';
    return {
      permission: review ? 'bids.cancel' : 'support.manage',
      message: {
        title: review
          ? 'Bid cancellation awaiting review'
          : kind === 'support.reply'
            ? 'New buyer support message'
            : 'Buyer requested support',
        description: 'Conversation ' + r.number + ' needs your attention.',
        href: '/?section=support&conversation=' + id,
      },
    };
  }
  /** Bounded durable fan-out: source transactions never depend on email or Redis availability. */
  async flush() {
    const signals = await this.ledger.db.$transaction(
      async (tx) => {
        const pending = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM staff_activity_events WHERE processed_at IS NULL ORDER BY CASE WHEN kind='workspace.changed' THEN 1 ELSE 0 END,created_at,id LIMIT 20 FOR UPDATE SKIP LOCKED`;
        const changed = new Set<string>();
        let workspace = false;
        for (const { id } of pending) {
          const event = await tx.staffActivityEvent.findUniqueOrThrow({
            where: { id },
          });
          if (event.kind === 'workspace.changed') {
            workspace = true;
            await tx.staffActivityEvent.update({
              where: { id },
              data: { processedAt: new Date() },
            });
            continue;
          }
          const description = await this.describe(
            tx,
            event.kind,
            event.entityId,
          );
          if (!description) {
            await tx.staffActivityEvent.update({
              where: { id },
              data: { processedAt: new Date() },
            });
            continue;
          }
          const recipients = await tx.user.findMany({
            where: {
              role: {
                in: [
                  'admin',
                  'manager',
                  'intake',
                  'warehouse',
                  'finance',
                  'support',
                ],
              },
              status: 'active',
              archivedAt: null,
              createdAt: { lte: event.createdAt },
              staffCredential: { isNot: null },
              ...(event.recipientCursor
                ? { id: { gt: event.recipientCursor } }
                : {}),
            },
            include: { staffMembership: { include: { role: true } } },
            orderBy: { id: 'asc' },
            take: 50,
          });
          for (const user of recipients) {
            const role = user.staffMembership?.role,
              permissions = staffPermissionsFor(
                user.role,
                role ? (role.archivedAt ? [] : role.permissions) : undefined,
              );
            if (
              !staffNotificationPermissions(permissions).includes(
                description.permission,
              )
            )
              continue;
            await tx.notification.upsert({
              where: { reference: 'staff:' + event.id + ':' + user.id },
              update: {},
              create: {
                reference: 'staff:' + event.id + ':' + user.id,
                userId: user.id,
                channel: 'email',
                template: 'staff-activity-v1',
                staffPermission: description.permission,
                payloadCiphertext: encryptPii(
                  JSON.stringify({
                    emailCiphertext: user.emailCiphertext
                      ? Buffer.from(user.emailCiphertext).toString('base64')
                      : null,
                    message:
                      event.kind === 'sale.completed' &&
                      permissions.includes('pickup.manage')
                        ? { ...description.message, href: '/?section=pickup' }
                        : description.message,
                    deliveryMode: staffEmailMode(),
                  }),
                  'notification',
                ),
              },
            });
            changed.add(user.id);
          }
          await tx.staffActivityEvent.update({
            where: { id },
            data: {
              recipientCursor: recipients.at(-1)?.id ?? event.recipientCursor,
              ...(recipients.length < 50 ? { processedAt: new Date() } : {}),
            },
          });
        }
        return { users: [...changed], workspace };
      },
      { timeout: 30000 },
    );
    if (!process.env.REDIS_URL || (!signals.users.length && !signals.workspace))
      return;
    const redis = createClient({
      url: process.env.REDIS_URL,
      socket: { connectTimeout: 1000, reconnectStrategy: false },
    });
    redis.on('error', () => {});
    try {
      await redis.connect();
      for (const userId of signals.users)
        await redis.publish(
          (process.env.BID_NAMESPACE || BID_STREAM_NAMESPACE) + 'staff-updates',
          JSON.stringify({ userId }),
        );
      if (signals.workspace)
        await redis.publish(
          (process.env.BID_NAMESPACE || BID_STREAM_NAMESPACE) + 'staff-updates',
          JSON.stringify({ userId: null }),
        );
    } catch {
      /* Confirmed inbox rows are reconciled by silent polling. */
    } finally {
      if (redis.isOpen) redis.destroy();
    }
  }
}
