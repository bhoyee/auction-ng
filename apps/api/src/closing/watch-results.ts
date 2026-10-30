import { encryptPii } from '../security/pii';
import type { LedgerService } from '../ledger/ledger-service';
import { fromLedgerKobo } from '@auction-ng/shared';
import { paymentReturnUrl } from '../payments/payment-return-url';

export async function enqueueWatchResults(db: LedgerService['db']) {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      {
        userId: string;
        lotId: string;
        emailCiphertext: Uint8Array | null;
        title: string;
        lotNumber: string;
        price: bigint | null;
        buyerId: string | null;
        watchedAt: Date;
        endsAt: Date;
      }[]
    >`
      SELECT w.user_id AS "userId", w.lot_id AS "lotId", u.email_ciphertext AS "emailCiphertext",
        l.title, l.lot_number AS "lotNumber", i.user_id AS "buyerId", il.hammer_kobo AS price,
        w.created_at AS "watchedAt", l.end_at AS "endsAt"
      FROM watchlist w JOIN lots l ON l.id=w.lot_id AND l.status='closed'
      JOIN users u ON u.id=w.user_id
      LEFT JOIN invoice_lines il ON il.lot_id=l.id
      LEFT JOIN invoices i ON i.id=il.invoice_id AND i.status='paid'
      LEFT JOIN lot_settlements s ON s.lot_id=l.id
      WHERE w.result_handled_at IS NULL AND (i.id IS NOT NULL OR s.status IN ('unsold','defaulted'))
      ORDER BY w.lot_id,w.user_id LIMIT 50 FOR UPDATE OF w SKIP LOCKED`;
    const notices = rows
      .filter(
        (row) =>
          row.buyerId !== null &&
          row.buyerId !== row.userId &&
          row.price !== null &&
          row.watchedAt <= row.endsAt,
      )
      .map((row) => ({
        userId: row.userId,
        reference: `watch-lost:${row.lotId}:${row.userId}`,
        channel: 'email',
        template: 'watch-lost-v1',
        payloadCiphertext: encryptPii(
          JSON.stringify({
            emailCiphertext: row.emailCiphertext
              ? Buffer.from(row.emailCiphertext).toString('base64')
              : null,
            message: {
              title: row.title,
              lotNumber: row.lotNumber,
              finalPriceKobo:
                row.price === null ? 0 : fromLedgerKobo(row.price),
              itemUrl: new URL(
                `/lots/${row.lotId}`,
                paymentReturnUrl('purchase', row.lotId),
              ).href,
            },
          }),
          'notification',
        ),
      }));
    if (notices.length)
      await tx.notification.createMany({ data: notices, skipDuplicates: true });
    if (rows.length)
      await tx.watchlist.updateMany({
        where: {
          OR: rows.map((row) => ({ userId: row.userId, lotId: row.lotId })),
          resultHandledAt: null,
        },
        data: { resultHandledAt: new Date() },
      });
    return { processed: rows.length, notified: notices.length };
  });
}
