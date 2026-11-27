import { encryptPii } from '../security/pii';
import { lotPath } from '@auction-ng/shared';
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
        bid: boolean;
      }[]
    >`
      SELECT w.user_id AS "userId", w.lot_id AS "lotId", u.email_ciphertext AS "emailCiphertext",
        l.title, l.lot_number AS "lotNumber", i.user_id AS "buyerId", il.hammer_kobo AS price,
        w.created_at AS "watchedAt", l.end_at AS "endsAt",
        EXISTS (SELECT 1 FROM bids b WHERE b.lot_id=w.lot_id AND b.user_id=w.user_id) AS bid
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
          row.watchedAt <= row.endsAt &&
          // Bidders get the bidder notice instead (enqueueBidderLosses).
          !row.bid,
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
                lotPath({ ...row, id: row.lotId }),
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

/**
 * Every losing bidder gets one "another buyer won this item" email, whether
 * or not they saved the item (2026-11-27). Buyers who cancelled their bid on
 * the item are left out. Each lot is processed once; lots closed before this
 * change were marked done by the migration.
 */
export async function enqueueBidderLosses(db: LedgerService['db']) {
  return db.$transaction(async (tx) => {
    const lots = await tx.$queryRaw<
      {
        lotId: string;
        title: string;
        lotNumber: string;
        buyerId: string | null;
        price: bigint | null;
        bought: boolean;
        unsold: boolean;
      }[]
    >`
      SELECT l.id AS "lotId", l.title, l.lot_number AS "lotNumber",
        i.user_id AS "buyerId", il.hammer_kobo AS price,
        EXISTS (SELECT 1 FROM purchases p WHERE p.lot_id=l.id AND p.status='paid') AS bought,
        COALESCE(s.status='unsold', false) AS unsold
      FROM lots l
      LEFT JOIN invoice_lines il ON il.lot_id=l.id
      LEFT JOIN invoices i ON i.id=il.invoice_id AND i.status='paid'
      LEFT JOIN lot_settlements s ON s.lot_id=l.id
      WHERE l.status='closed' AND l.losers_notified_at IS NULL
        AND (i.id IS NOT NULL OR s.status='unsold')
      ORDER BY l.id LIMIT 20 FOR UPDATE OF l SKIP LOCKED`;
    let notified = 0;
    for (const lot of lots) {
      const { buyerId, price } = lot;
      if (!lot.unsold && buyerId && price !== null) {
        const losers = await tx.$queryRaw<
          { userId: string; emailCiphertext: Uint8Array | null }[]
        >`
          SELECT DISTINCT b.user_id AS "userId", u.email_ciphertext AS "emailCiphertext"
          FROM bids b JOIN users u ON u.id=b.user_id
          WHERE b.lot_id=${lot.lotId}::uuid AND b.user_id<>${buyerId}::uuid
            AND NOT EXISTS (SELECT 1 FROM bid_cancellation_approvals c
              WHERE c.lot_id=b.lot_id AND c.buyer_id=b.user_id AND c.status IN ('committed','completed'))`;
        const itemUrl = new URL(
          lotPath({ ...lot, id: lot.lotId }),
          paymentReturnUrl('purchase', lot.lotId),
        ).href;
        const result = await tx.notification.createMany({
          data: losers.map((loser) => ({
            userId: loser.userId,
            reference: `bid-lost:${lot.lotId}:${loser.userId}`,
            channel: 'email',
            template: 'watch-lost-v1',
            payloadCiphertext: encryptPii(
              JSON.stringify({
                emailCiphertext: loser.emailCiphertext
                  ? Buffer.from(loser.emailCiphertext).toString('base64')
                  : null,
                message: {
                  title: lot.title,
                  lotNumber: lot.lotNumber,
                  finalPriceKobo: fromLedgerKobo(price),
                  itemUrl,
                  reason: 'bid',
                  outcome: lot.bought ? 'bought' : 'won',
                },
              }),
              'notification',
            ),
          })),
          skipDuplicates: true,
        });
        notified += result.count;
      }
      await tx.lot.update({
        where: { id: lot.lotId },
        data: { losersNotifiedAt: new Date() },
      });
    }
    return { processed: lots.length, notified };
  });
}
