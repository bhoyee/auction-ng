import type { LedgerService } from '../ledger/ledger-service';
import { decryptPii, encryptPii } from '../security/pii';

/** A durable cursor and outbox inserts commit together; retries cannot skip or duplicate buyers. */
export async function flushLotMessages(ledger: LedgerService) {
  return ledger.db.$transaction(async (tx) => {
    const [pending] = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM lot_bidder_messages WHERE completed_at IS NULL ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`;
    if (!pending) return { processed: 0 };
    const job = await tx.lotBidderMessage.findUniqueOrThrow({
      where: { id: pending.id },
    });
    // UNION deduplicates bidders who also watch; the existing per-lot indexes
    // keep this cursor scan bounded without fetching all recipient IDs.
    const buyers = await tx.$queryRaw<{ userId: string }[]>`
      SELECT recipients.user_id AS "userId" FROM (
        SELECT user_id FROM bids WHERE lot_id=${job.lotId}::uuid AND created_at<=${job.cutoffAt}
        UNION SELECT user_id FROM watchlist WHERE lot_id=${job.lotId}::uuid AND created_at<=${job.cutoffAt}
      ) recipients WHERE (${job.cursorUserId}::uuid IS NULL OR recipients.user_id>${job.cursorUserId}::uuid)
      ORDER BY recipients.user_id LIMIT 50`;
    const [lot, users] = await Promise.all([
      tx.lot.findUniqueOrThrow({
        where: { id: job.lotId },
        select: { title: true, lotNumber: true },
      }),
      tx.user.findMany({
        where: {
          id: { in: buyers.map((b) => b.userId) },
          role: 'buyer',
          status: 'active',
          archivedAt: null,
        },
        select: { id: true, emailCiphertext: true },
      }),
    ]);
    const message = decryptPii(
      Buffer.from(job.messageCiphertext),
      'lot-message',
    );
    if (users.length)
      await tx.notification.createMany({
        data: users.map((user) => ({
          userId: user.id,
          reference: `lot-message:${job.lotId}:${job.id}:${user.id}`,
          channel: 'email',
          template: 'lot-message-v1',
          payloadCiphertext: encryptPii(
            JSON.stringify({
              emailCiphertext: user.emailCiphertext
                ? Buffer.from(user.emailCiphertext).toString('base64')
                : null,
              message: { ...lot, lotId: job.lotId, message },
            }),
            'notification',
          ),
        })),
        skipDuplicates: true,
      });
    await tx.lotBidderMessage.update({
      where: { id: job.id },
      data: {
        cursorUserId: buyers.at(-1)?.userId ?? job.cursorUserId,
        recipientCount: { increment: users.length },
        ...(buyers.length < 50 ? { completedAt: new Date() } : {}),
      },
    });
    return { processed: users.length };
  });
}
