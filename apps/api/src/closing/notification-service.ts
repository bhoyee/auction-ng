import { z } from 'zod';
import { LedgerService } from '../ledger/ledger-service';
import { decryptPii } from '../security/pii';
import { winnerEmail, winnerMailSchema } from './winner-email';

const envelope = z
  .object({ emailCiphertext: z.string().nullable(), message: winnerMailSchema })
  .strict();
export class NotificationService {
  constructor(private readonly ledger: LedgerService) {}
  async deliver() {
    // Production delivery is intentionally unconfigured; never send real email through local mode.
    if (process.env.AUTH_MODE !== 'local') return;
    const base = new URL(process.env.MAILPIT_URL ?? 'http://localhost:8025');
    if (
      base.protocol !== 'http:' ||
      !['localhost', '127.0.0.1', 'mailpit'].includes(base.hostname) ||
      base.username ||
      base.password
    )
      throw new Error('Use local Mailpit only.');
    await this.ledger.db.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM notifications WHERE template='auction-result-v1' AND status='pending' ORDER BY created_at,id LIMIT 20 FOR UPDATE SKIP LOCKED`;
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
          const response = await fetch(new URL('/api/v1/send', base), {
            method: 'POST',
            redirect: 'error',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(5000),
            body: JSON.stringify({
              From: { Email: 'receipts@auction-ng.test', Name: 'Auction NG' },
              To: [{ Email: email }],
              ...winnerEmail(payload.message),
            }),
          });
          if (!response.ok) throw new Error('Local receipt delivery failed.');
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
