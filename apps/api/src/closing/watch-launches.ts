import { WATCH_LAUNCH_REMINDER_MS } from '@auction-ng/shared';
import { lotPath } from '@auction-ng/shared';
import type { LedgerService } from '../ledger/ledger-service';
import { encryptPii } from '../security/pii';
import { paymentReturnUrl } from '../payments/payment-return-url';
import type { Prisma } from '../generated/prisma/client';
import { z } from 'zod';

export async function watchLaunchStillRelevant(
  db: Pick<Prisma.TransactionClient, 'watchlist'>,
  reference: string | null,
) {
  const [kind, lotId, version, userId] = (reference ?? '').split(':');
  if (
    !['watch-soon', 'watch-live'].includes(kind ?? '') ||
    !z.uuid().safeParse(lotId).success ||
    !z.uuid().safeParse(userId).success ||
    !/^\d+$/.test(version ?? '')
  )
    return false;
  const row = await db.watchlist.findFirst({
    where: { lotId, userId },
    include: { lot: true, user: true },
  });
  if (!row) return false;
  const l = row.lot,
    now = Date.now();
  return (
    row.user.role === 'buyer' &&
    row.user.status === 'active' &&
    row.user.emailVerifiedAt !== null &&
    l.scheduleVersion === Number(version) &&
    !l.archivedAt &&
    !l.preBidsLaunching &&
    l.endAt.getTime() > now &&
    row.createdAt <= l.startAt &&
    (kind === 'watch-soon'
      ? l.status === 'scheduled' && l.startAt.getTime() > now
      : l.status === 'open' && l.startAt.getTime() <= now)
  );
}

export async function enqueueWatchLaunches(db: LedgerService['db']) {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      {
        userId: string;
        lotId: string;
        title: string;
        lotNumber: string;
        emailCiphertext: Uint8Array | null;
        startAt: Date;
        scheduleVersion: number;
        phase: 'soon' | 'live';
      }[]
    >`SELECT w.user_id AS "userId",w.lot_id AS "lotId",l.title,l.lot_number AS "lotNumber",
      u.email_ciphertext AS "emailCiphertext",l.start_at AS "startAt",l.schedule_version AS "scheduleVersion",
      CASE WHEN l.status='scheduled' THEN 'soon' ELSE 'live' END AS phase
      FROM lots l JOIN watchlist w ON w.lot_id=l.id JOIN users u ON u.id=w.user_id
      WHERE l.archived_at IS NULL AND l.end_at>now() AND w.created_at<=l.start_at
      AND u.role='buyer' AND u.status='active' AND u.email_verified_at IS NOT NULL
      AND ((l.status='scheduled' AND NOT l.pre_bids_launching AND l.start_at>now()
        AND l.start_at<=now()+${WATCH_LAUNCH_REMINDER_MS}*interval '1 millisecond'
        AND w.launch_reminded_version IS DISTINCT FROM l.schedule_version)
      OR (l.status='open' AND NOT l.pre_bids_launching AND l.start_at<=now()
        AND w.live_notified_version IS DISTINCT FROM l.schedule_version))
      ORDER BY l.start_at,l.id,w.user_id LIMIT 50 FOR UPDATE OF w SKIP LOCKED`;
    for (const row of rows) {
      await tx.notification.createMany({
        data: [
          {
            userId: row.userId,
            channel: 'email',
            template: 'watch-launch-v1',
            reference: `watch-${row.phase}:${row.lotId}:${row.scheduleVersion}:${row.userId}`,
            payloadCiphertext: encryptPii(
              JSON.stringify({
                emailCiphertext: row.emailCiphertext
                  ? Buffer.from(row.emailCiphertext).toString('base64')
                  : null,
                message: {
                  phase: row.phase,
                  title: row.title,
                  lotNumber: row.lotNumber,
                  startsAt: row.startAt.toISOString(),
                  itemUrl: new URL(
                    lotPath(row),
                    paymentReturnUrl('purchase', row.lotId),
                  ).href,
                },
              }),
              'notification',
            ),
          },
        ],
        skipDuplicates: true,
      });
      await tx.watchlist.update({
        where: { userId_lotId: { userId: row.userId, lotId: row.lotId } },
        data:
          row.phase === 'soon'
            ? { launchRemindedVersion: row.scheduleVersion }
            : { liveNotifiedVersion: row.scheduleVersion },
      });
    }
    return { processed: rows.length };
  });
}
