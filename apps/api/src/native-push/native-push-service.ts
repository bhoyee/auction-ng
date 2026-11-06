import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  nativePushRegisterSchema,
  type NativePushRegister,
} from '@auction-ng/shared';
import type { AuthIdentity } from '../auth/auth-service';
import type { LedgerService } from '../ledger/ledger-service';
import { encryptPii, decryptPii, hashPii } from '../security/pii';
import { watchLaunchStillRelevant } from '../closing/watch-launches';
import { storageNoticeRelevant } from '../pickup/storage-email';
export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data: { path: '/notifications'; notificationId: string };
  sound: 'default';
  channelId: 'auction-updates';
};
export type PushTicket = {
  status: 'ok' | 'error';
  id?: string;
  error?: string;
};
export type PushSender = (message: PushMessage) => Promise<PushTicket>;
const ticketSchema = z
  .object({
    data: z
      .object({
        status: z.enum(['ok', 'error']),
        id: z.string().max(100).optional(),
        details: z.object({ error: z.string().optional() }).optional(),
      })
      .passthrough(),
  })
  .passthrough();
async function expoSend(message: PushMessage): Promise<PushTicket> {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.EXPO_PUSH_ACCESS_TOKEN
        ? { Authorization: 'Bearer ' + process.env.EXPO_PUSH_ACCESS_TOKEN }
        : {}),
    },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw Error('Push provider could not confirm delivery.');
  const ticket = ticketSchema.parse(await response.json()).data;
  return { status: ticket.status, id: ticket.id, error: ticket.details?.error };
}
export class NativePushService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly sender?: PushSender,
  ) {}
  async register(identity: AuthIdentity, input: NativePushRegister) {
    if (!this.sender && process.env.EXPO_PUSH_ENABLED !== 'true')
      throw new ServiceUnavailableException(
        'Phone push delivery is not configured.',
      );
    const value = nativePushRegisterSchema.parse(input);
    return this.ledger.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${identity.sessionId}::uuid FOR UPDATE`;
      const session = await tx.authSession.findUnique({
        where: { id: identity.sessionId },
        include: { user: true },
      });
      if (
        !session ||
        session.userId !== identity.user.id ||
        session.client !== 'mobile' ||
        session.revokedAt ||
        session.expiresAt.getTime() <= Date.now() ||
        session.user.role !== 'buyer' ||
        session.user.status !== 'active' ||
        !session.user.emailVerifiedAt
      )
        throw new ForbiddenException();
      const hash = hashPii(value.token, 'native-push-token');
      const previous = await tx.nativePushDevice.findUnique({
        where: { tokenHash: hash },
      });
      await tx.nativePushDevice.updateMany({
        where: { sessionId: session.id, tokenHash: { not: hash } },
        data: { enabled: false },
      });
      const enabledAt =
        previous?.userId === session.userId &&
        previous.sessionId === session.id &&
        previous.enabled
          ? previous.enabledAt
          : new Date();
      const data = {
        userId: session.userId,
        sessionId: session.id,
        tokenCiphertext: encryptPii(value.token, 'native-push-token'),
        platform: value.platform,
        enabled: true,
        enabledAt,
      };
      await tx.nativePushDevice.upsert({
        where: { tokenHash: hash },
        create: { ...data, tokenHash: hash },
        update: data,
      });
      return { enabled: true };
    });
  }
  async disable(identity: AuthIdentity) {
    await this.ledger.db.nativePushDevice.updateMany({
      where: { sessionId: identity.sessionId, userId: identity.user.id },
      data: { enabled: false },
    });
    return { enabled: false };
  }
  async deliver() {
    if (!this.sender && process.env.EXPO_PUSH_ENABLED !== 'true') return;
    // Each tick creates only a bounded batch; the unique pair is the durable outbox key.
    await this.ledger.db
      .$executeRaw`INSERT INTO native_push_deliveries(id,notification_id,device_id)
   SELECT gen_random_uuid(),n.id,d.id FROM native_push_devices d JOIN auth_sessions s ON s.id=d.session_id AND s.user_id=d.user_id JOIN users u ON u.id=d.user_id JOIN notifications n ON n.user_id=d.user_id
   WHERE d.enabled=true AND s.revoked_at IS NULL AND s.expires_at>now() AND u.role='buyer' AND u.status='active' AND n.created_at>=d.enabled_at
   AND n.template IN ('outbid-v1','auction-result-v1','watch-lost-v1','watch-launch-v1','withdrawal-v1','support-v1','prebid-v1','bid-cancellation-v1','staff-refund-v1','pickup-storage-v1')
   AND NOT EXISTS(SELECT 1 FROM native_push_deliveries p WHERE p.notification_id=n.id AND p.device_id=d.id)
   ORDER BY n.created_at,n.id,d.id LIMIT 50 ON CONFLICT(notification_id,device_id) DO NOTHING`;
    await this.ledger.db.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM native_push_deliveries WHERE status='pending' ORDER BY created_at,id LIMIT 10 FOR UPDATE SKIP LOCKED`;
        for (const { id } of rows) {
          const row = await tx.nativePushDelivery.findUniqueOrThrow({
            where: { id },
            include: {
              device: { include: { session: true, user: true } },
              notification: true,
            },
          });
          const d = row.device;
          if (
            !d.enabled ||
            d.userId !== row.notification.userId ||
            d.session.revokedAt ||
            d.session.expiresAt.getTime() <= Date.now() ||
            d.user.status !== 'active' ||
            (row.notification.template === 'pickup-storage-v1' &&
              !(await storageNoticeRelevant(tx, row.notification.reference))) ||
            (row.notification.template === 'watch-launch-v1' &&
              !(await watchLaunchStillRelevant(tx, row.notification.reference)))
          ) {
            await tx.nativePushDelivery.update({
              where: { id },
              data: { status: 'skipped' },
            });
            continue;
          }
          const body =
            row.notification.template === 'pickup-storage-v1'
              ? 'Your pickup details have an update. Check your collection deadline in LotVanta.'
              : row.notification.template === 'watch-launch-v1'
                ? row.notification.reference?.startsWith('watch-live:')
                  ? 'An item you watched is live. Open LotVanta to start bidding.'
                  : 'An item you watched starts soon. Open LotVanta to check its launch time.'
                : row.notification.template === 'outbid-v1'
                  ? 'You have been outbid. Open LotVanta to review your auction.'
                  : row.notification.template === 'auction-result-v1'
                    ? 'Your auction result is ready. Open LotVanta for the latest details.'
                    : 'You have a LotVanta account update.';
          try {
            const ticket = await (this.sender ?? expoSend)({
              to: decryptPii(
                Buffer.from(d.tokenCiphertext),
                'native-push-token',
              ),
              title: 'LotVanta',
              body,
              data: {
                path: '/notifications',
                notificationId: row.notificationId,
              },
              sound: 'default',
              channelId: 'auction-updates',
            });
            await tx.nativePushDelivery.update({
              where: { id },
              data: {
                status: ticket.status === 'ok' ? 'sent' : 'failed',
                ticketId: ticket.id ?? null,
                attempts: { increment: 1 },
              },
            });
            if (ticket.error === 'DeviceNotRegistered')
              await tx.nativePushDevice.update({
                where: { id: d.id },
                data: { enabled: false },
              });
          } catch {
            // An ambiguous provider reply must not replay a duplicate phone alert.
            await tx.nativePushDelivery.update({
              where: { id },
              data: { status: 'unknown', attempts: { increment: 1 } },
            });
          }
        }
      },
      { timeout: 90000 },
    );
  }
}
