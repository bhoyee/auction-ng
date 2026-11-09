import { refundEmail } from '../staff-admin/refund-email';
import { flushLotMessages } from '../staff-admin/lot-message-delivery';
import { lotMessageEmail } from '../staff-admin/lot-message-email';
import { storageEmail, storageNoticeRelevant } from '../pickup/storage-email';
import {
  enqueueWatchLaunches,
  watchLaunchStillRelevant,
} from './watch-launches';
import { watchLaunchEmail } from './watch-launch-email';
import {
  StaffActivityService,
  staffEmailMode,
  staffNoticeMessageSchema,
} from '../staff-admin/staff-activity-service';
import { staffActivityEmail } from '../staff-admin/staff-activity-email';
import { staffAccess } from '../auth/staff-access';
import { NativePushService } from '../native-push/native-push-service';
import { z } from 'zod';
import { preBidEmail } from '../prebids/prebid-email';
import { bidCancellationEmail } from '../bids/bid-cancellation-email';
import {
  effectiveAuctionFeeRules,
  fromLedgerKobo,
  staffNotificationPermissions,
  staffNotificationHref,
  type StaffPermission,
} from '@auction-ng/shared';
import { supportEmail } from '../support/support-email';
import { LedgerService } from '../ledger/ledger-service';
import { decryptPii, encryptPii } from '../security/pii';
import { winnerEmail, winnerMailSchema } from './winner-email';
import { readWinnerPickup } from './winner-pickup';
import { watchLostEmail, watchLostMailSchema } from './watch-lost-email';
import { enqueueWatchResults } from './watch-results';
import { outbidEmail } from './outbid-email';
import {
  withdrawalEmail,
  withdrawalMailSchema,
} from '../withdrawals/withdrawal-email';
import type { MailDelivery } from '../email/mail-delivery';
import {
  WELCOME_TEMPLATE,
  welcomeEmail,
  welcomeMailSchema,
} from '../auth/welcome-email';
import {
  createMailDelivery,
  isReservedRecipient,
} from '../email/mail-delivery';

const envelope = z
  .object({
    emailCiphertext: z.string().nullable(),
    message: z.unknown(),
    deliveryMode: z.enum(['smtp', 'preview', 'off']).optional(),
  })
  .strict();
export class NotificationService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly mail?: MailDelivery,
  ) {}
  async deliver(supportOnly = false) {
    if (!supportOnly) {
      try {
        await flushLotMessages(this.ledger);
      } catch {
        console.warn(
          'Bidder message dispatch will retry; other notification delivery continues.',
        );
      }
    }
    if (!supportOnly) await enqueueWatchLaunches(this.ledger.db);
    await new StaffActivityService(this.ledger).flush();
    await new NativePushService(this.ledger).deliver();
    if (!supportOnly) await enqueueWatchResults(this.ledger.db);
    const delivery =
      this.mail ??
      createMailDelivery(
        process.env.AUTH_MODE,
        process.env,
        'receipts@auction-ng.test',
      );
    if (!delivery) return;
    // Bound network time while pending rows are locked by the delivery transaction.
    const batchSize = process.env.AUTH_MODE === 'smtp' ? 5 : 20;
    await this.ledger.db.$transaction(
      async (tx) => {
        const rows = supportOnly
          ? await tx.$queryRaw<
              { id: string }[]
            >`SELECT id FROM notifications WHERE template IN ('support-v1','staff-activity-v1') AND status='pending' ORDER BY created_at,id LIMIT ${batchSize} FOR UPDATE SKIP LOCKED`
          : await tx.$queryRaw<
              { id: string }[]
            >`SELECT id FROM notifications WHERE template IN ('auction-result-v1','watch-lost-v1','watch-launch-v1','outbid-v1','lot-message-v1','withdrawal-v1','support-v1','prebid-v1','bid-cancellation-v1','staff-refund-v1','pickup-storage-v1','welcome-v1') AND status='pending' ORDER BY created_at,id LIMIT ${batchSize} FOR UPDATE SKIP LOCKED`;
        for (const { id } of rows) {
          const row = await tx.notification.findUniqueOrThrow({
            where: { id },
          });
          if (
            row.template === 'pickup-storage-v1' &&
            !(await storageNoticeRelevant(tx, row.reference))
          ) {
            await tx.notification.update({
              where: { id },
              data: { status: 'failed' },
            });
            continue;
          }
          if (
            row.template === 'watch-launch-v1' &&
            !(await watchLaunchStillRelevant(tx, row.reference))
          ) {
            await tx.notification.update({
              where: { id },
              data: { status: 'failed' },
            });
            continue;
          }
          let staffPermissions: StaffPermission[] | undefined;
          if (row.template === 'staff-activity-v1') {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(715,1)`;
            const access = await staffAccess(tx, row.userId).catch(
              () => undefined,
            );
            if (
              !access ||
              !row.staffPermission ||
              !staffNotificationPermissions(access.permissions).some(
                (p) => p === row.staffPermission,
              )
            ) {
              await tx.notification.update({
                where: { id },
                data: { status: 'failed' },
              });
              continue;
            }
            staffPermissions = access.permissions;
          }
          const payload = envelope.parse(
            JSON.parse(
              decryptPii(Buffer.from(row.payloadCiphertext), 'notification'),
            ),
          );
          if (staffPermissions) {
            const message = staffNoticeMessageSchema.parse(payload.message);
            payload.message = {
              ...message,
              href: staffNotificationHref(
                message.href,
                row.staffPermission,
                staffPermissions,
              ),
            };
          }
          if (!payload.emailCiphertext) {
            await tx.notification.update({
              where: { id },
              data: { status: 'failed' },
            });
            continue;
          }
          const email = z
            .email()
            .parse(
              decryptPii(
                Buffer.from(payload.emailCiphertext, 'base64'),
                'email',
              ),
            );
          if (process.env.AUTH_MODE === 'smtp' && isReservedRecipient(email)) {
            await tx.notification.update({
              where: { id },
              data: { status: 'failed' },
            });
            continue;
          }
          // Older queued receipts predate fee snapshots. Resolve their immutable
          // settlement policy rather than using today's marketplace settings.
          if (row.template === 'auction-result-v1') {
            const message = winnerMailSchema.parse(payload.message);
            message.pickup = await readWinnerPickup(
              tx,
              row.userId,
              message.invoiceNumber,
              message.lotNumber,
            );
            if (message.saleType === 'auction' && !message.feeRates) {
              const settlement = await tx.lotSettlement.findFirst({
                where: { invoice: { number: message.invoiceNumber } },
                include: { feePolicy: true },
              });
              if (settlement) {
                const rules = effectiveAuctionFeeRules({
                  ...settlement.feePolicy,
                  lotFeeKobo: fromLedgerKobo(settlement.feePolicy.lotFeeKobo),
                });
                message.feeRates = {
                  premiumBps: rules.premiumBps,
                  vatBps: rules.vatBps,
                };
              }
            }
            payload.message = message;
          }
          await delivery.send(
            email,
            row.template === WELCOME_TEMPLATE
              ? welcomeEmail(welcomeMailSchema.parse(payload.message))
              : row.template === 'lot-message-v1'
                ? lotMessageEmail(payload.message)
                : row.template === 'watch-launch-v1'
                  ? watchLaunchEmail(payload.message)
                  : row.template === 'staff-activity-v1'
                    ? staffActivityEmail(payload.message)
                    : row.template === 'pickup-storage-v1'
                      ? storageEmail(payload.message)
                      : row.template === 'staff-refund-v1'
                        ? refundEmail(payload.message)
                        : row.template === 'bid-cancellation-v1'
                          ? bidCancellationEmail(payload.message)
                          : row.template === 'prebid-v1'
                            ? preBidEmail(payload.message)
                            : row.template === 'support-v1'
                              ? supportEmail(payload.message)
                              : row.template === 'withdrawal-v1'
                                ? withdrawalEmail(
                                    withdrawalMailSchema.parse(payload.message),
                                  )
                                : row.template === 'outbid-v1'
                                  ? outbidEmail(
                                      watchLostMailSchema.parse(
                                        payload.message,
                                      ),
                                    )
                                  : row.template === 'watch-lost-v1'
                                    ? watchLostEmail(
                                        watchLostMailSchema.parse(
                                          payload.message,
                                        ),
                                      )
                                    : winnerEmail(
                                        winnerMailSchema.parse(payload.message),
                                      ),
            `auction-ng/notification/${row.id}`,
          );
          await tx.notification.update({
            where: { id },
            data: {
              status: 'sent',
              sentAt: new Date(),
              ...(row.template === 'staff-activity-v1'
                ? {
                    payloadCiphertext: encryptPii(
                      JSON.stringify({
                        ...payload,
                        deliveryMode: staffEmailMode(),
                      }),
                      'notification',
                    ),
                  }
                : {}),
            },
          });
        }
      },
      { maxWait: 5000, timeout: 120000 },
    );
  }
}
