import { HttpException } from '@nestjs/common';
import {
  PURCHASE_UNLOCK_MS,
  PURCHASE_UNLOCK_REQUIRED,
} from '@auction-ng/shared';
import type { Prisma } from '../generated/prisma/client';

/**
 * Inside the bid, pre-bid or purchase transaction, after its user lock and
 * before any money is reserved: refuses unless this sign-in confirmed it's the
 * owner in the last 30 minutes, then restarts the 30 minutes.
 */
export async function requirePurchaseUnlock(
  tx: Prisma.TransactionClient,
  sessionId: string,
  now = Date.now(),
) {
  const [row] = await tx.$queryRaw<{ until: Date | null }[]>`
    SELECT purchase_unlocked_until AS until FROM auth_sessions
    WHERE id = ${sessionId}::uuid FOR UPDATE`;
  if (!row?.until || row.until.getTime() <= now)
    throw new HttpException(
      {
        code: PURCHASE_UNLOCK_REQUIRED,
        // Older app versions show this text as it is.
        message:
          'Confirm it’s you before bidding or buying. On the GiddyDeal app, update to the latest version first.',
      },
      403,
    );
  await tx.authSession.update({
    where: { id: sessionId },
    data: { purchaseUnlockedUntil: new Date(now + PURCHASE_UNLOCK_MS) },
  });
}
