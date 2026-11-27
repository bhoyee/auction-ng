import type { Prisma } from '../generated/prisma/client';
import { lotPath } from '@auction-ng/shared';
import { encryptPii } from '../security/pii';
import { paymentReturnUrl } from '../payments/payment-return-url';

/** "Your bid is live": the bidder's own accepted bid, while they lead. */
export async function enqueueBidPlacedNotice(
  tx: Prisma.TransactionClient,
  event: {
    id: string;
    lotId: string;
    requesterId: string;
    leaderId: string;
    priceKobo: number;
  },
) {
  // A bid that is overtaken at once gets the outbid email instead.
  if (event.requesterId !== event.leaderId) return;
  const lot = await tx.lot.findUniqueOrThrow({
    where: { id: event.lotId },
    select: { title: true, lotNumber: true },
  });
  const user = await tx.user.findUniqueOrThrow({
    where: { id: event.requesterId },
    select: { emailCiphertext: true },
  });
  await tx.notification.createMany({
    data: [
      {
        userId: event.requesterId,
        reference: `bid-placed:${event.id}:${event.requesterId}:${event.lotId}`,
        channel: 'email',
        template: 'bid-placed-v1',
        payloadCiphertext: encryptPii(
          JSON.stringify({
            emailCiphertext: user.emailCiphertext
              ? Buffer.from(user.emailCiphertext).toString('base64')
              : null,
            message: {
              title: lot.title,
              lotNumber: lot.lotNumber,
              finalPriceKobo: event.priceKobo,
              itemUrl: new URL(
                lotPath({ ...lot, id: event.lotId }),
                paymentReturnUrl('purchase', event.lotId),
              ).href,
            },
          }),
          'notification',
        ),
      },
    ],
    skipDuplicates: true,
  });
}
export async function enqueueOutbidNotice(
  tx: Prisma.TransactionClient,
  event: {
    id: string;
    lotId: string;
    requesterId: string;
    previousLeaderId: string;
    leaderId: string;
    priceKobo: number;
  },
) {
  const recipients = [
    ...new Set([event.previousLeaderId, event.requesterId]),
  ].filter((id) => id && id !== event.leaderId);
  if (!recipients.length) return;
  const lot = await tx.lot.findUniqueOrThrow({
    where: { id: event.lotId },
    select: { title: true, lotNumber: true },
  });
  const users = await tx.user.findMany({
    where: { id: { in: recipients } },
    select: { id: true, emailCiphertext: true },
  });
  await tx.notification.createMany({
    data: users.map((user) => ({
      userId: user.id,
      reference: `outbid:${event.id}:${user.id}:${event.lotId}`,
      channel: 'email',
      template: 'outbid-v1',
      payloadCiphertext: encryptPii(
        JSON.stringify({
          emailCiphertext: user.emailCiphertext
            ? Buffer.from(user.emailCiphertext).toString('base64')
            : null,
          message: {
            title: lot.title,
            lotNumber: lot.lotNumber,
            finalPriceKobo: event.priceKobo,
            itemUrl: new URL(
              lotPath({ ...lot, id: event.lotId }),
              paymentReturnUrl('purchase', event.lotId),
            ).href,
          },
        }),
        'notification',
      ),
    })),
    skipDuplicates: true,
  });
}
