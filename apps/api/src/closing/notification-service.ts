import { z } from 'zod';
import { LedgerService } from '../ledger/ledger-service';
import { decryptPii } from '../security/pii';
import { winnerEmail, winnerMailSchema } from './winner-email';
import { watchLostEmail, watchLostMailSchema } from './watch-lost-email';
import { enqueueWatchResults } from './watch-results';
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
  async deliver() {
    await enqueueWatchResults(this.ledger.db);
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
        const rows = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM notifications WHERE template IN ('auction-result-v1','watch-lost-v1') AND status='pending' ORDER BY created_at,id LIMIT ${batchSize} FOR UPDATE SKIP LOCKED`;
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
          await delivery.send(
            email,
            row.template === 'watch-lost-v1'
              ? watchLostEmail(watchLostMailSchema.parse(payload.message))
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
