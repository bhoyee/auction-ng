import { z } from 'zod';
import { preBidEmail } from '../prebids/prebid-email';
import { bidCancellationEmail } from '../bids/bid-cancellation-email';
import { effectiveAuctionFeeRules, fromLedgerKobo } from '@auction-ng/shared';
import { supportEmail } from '../support/support-email';
import { LedgerService } from '../ledger/ledger-service';
import { decryptPii } from '../security/pii';
import { winnerEmail, winnerMailSchema } from './winner-email';
import { watchLostEmail, watchLostMailSchema } from './watch-lost-email';
import { enqueueWatchResults } from './watch-results';
import { outbidEmail } from './outbid-email';
import {
  withdrawalEmail,
  withdrawalMailSchema,
} from '../withdrawals/withdrawal-email';
import type { MailDelivery } from '../email/mail-delivery';
import {
  createMailDelivery,
  isReservedRecipient,
} from '../email/mail-delivery';

const envelope = z
  .object({ emailCiphertext: z.string().nullable(), message: z.unknown() })
  .strict();
export class NotificationService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly mail?: MailDelivery,
  ) {}
  async deliver(supportOnly = false) {
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
            >`SELECT id FROM notifications WHERE template='support-v1' AND status='pending' ORDER BY created_at,id LIMIT ${batchSize} FOR UPDATE SKIP LOCKED`
          : await tx.$queryRaw<
              { id: string }[]
            >`SELECT id FROM notifications WHERE template IN ('auction-result-v1','watch-lost-v1','outbid-v1','withdrawal-v1','support-v1','prebid-v1','bid-cancellation-v1') AND status='pending' ORDER BY created_at,id LIMIT ${batchSize} FOR UPDATE SKIP LOCKED`;
        for (const { id } of rows) {
          const row = await tx.notification.findUniqueOrThrow({
            where: { id },
          });
          const payload = envelope.parse(
            JSON.parse(
              decryptPii(Buffer.from(row.payloadCiphertext), 'notification'),
            ),
          );
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
            row.template === 'bid-cancellation-v1'
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
                      ? outbidEmail(watchLostMailSchema.parse(payload.message))
                      : row.template === 'watch-lost-v1'
                        ? watchLostEmail(
                            watchLostMailSchema.parse(payload.message),
                          )
                        : winnerEmail(winnerMailSchema.parse(payload.message)),
            `auction-ng/notification/${row.id}`,
          );
          await tx.notification.update({
            where: { id },
            data: { status: 'sent', sentAt: new Date() },
          });
        }
      },
      { maxWait: 5000, timeout: 120000 },
    );
  }
}
