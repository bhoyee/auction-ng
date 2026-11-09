import type { Prisma } from '../generated/prisma/client';
import { encryptPii } from '../security/pii';
import { WELCOME_TEMPLATE, welcomeMessage } from './welcome-email';

type Tx = Prisma.TransactionClient;

export const buyerSiteOrigin = () =>
  process.env.PAYMENT_RETURN_ORIGIN ?? 'http://localhost:3300';

// Queues the welcome email once per buyer. The unique reference makes a
// repeated sign-up, retry or backfill a no-op; delivery runs in the existing
// notification loop, so a mail outage never blocks creating the account.
export async function queueWelcomeEmail(
  tx: Tx,
  user: { id: string; name: string; emailCiphertext: Uint8Array | null },
  origin = buyerSiteOrigin(),
) {
  if (!user.emailCiphertext) return false;
  const result = await tx.notification.createMany({
    data: [
      {
        userId: user.id,
        reference: `welcome:${user.id}`,
        channel: 'email',
        template: WELCOME_TEMPLATE,
        payloadCiphertext: encryptPii(
          JSON.stringify({
            emailCiphertext: Buffer.from(user.emailCiphertext).toString(
              'base64',
            ),
            message: welcomeMessage(user.name, origin),
          }),
          'notification',
        ),
      },
    ],
    skipDuplicates: true,
  });
  return result.count === 1;
}
