import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../src/generated/prisma/client';
import { encryptPii, hashPii } from '../src/security/pii';
import { actionChallengePurpose } from '../src/auth/action-verification-proof';

type Db = Pick<PrismaClient, 'user' | 'accountSecurityChallenge'>;
type Who = { userId: string; sessionId: string };

// A verified, unused single-use proof, as left by a completed check.
export async function actionProof(
  db: Db,
  who: Who,
  purpose: 'buy-now' | 'bid-cancellation',
  lotId: string,
  now = Date.now(),
) {
  const user = await db.user.findUniqueOrThrow({ where: { id: who.userId } });
  const id = randomUUID();
  await db.accountSecurityChallenge.create({
    data: {
      id,
      userId: who.userId,
      sessionId: who.sessionId,
      purpose: actionChallengePurpose(purpose),
      payloadCiphertext: encryptPii(
        JSON.stringify({
          passwordHash: user.buyerPasswordHash ?? '',
          version: user.authenticatorVersion,
          lotId,
        }),
        'account-security',
      ),
      codeHash: hashPii(`${id}:000000`, 'action-email'),
      emailVerifiedAt: new Date(now),
      verifiedAt: new Date(now),
      expiresAt: new Date(now + 10 * 60 * 1000),
    },
  });
  return id;
}
