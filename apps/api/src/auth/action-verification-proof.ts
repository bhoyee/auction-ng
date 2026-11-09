import { HttpException } from '@nestjs/common';
import { z } from 'zod';
import { VERIFICATION_REQUIRED, type ActionPurpose } from '@auction-ng/shared';
import type { Prisma } from '../generated/prisma/client';
import { decryptPii } from '../security/pii';

type Tx = Prisma.TransactionClient;

// Stored purposes are namespaced so a buyer action challenge can never be
// finished through the authenticator-settings flow, and the reverse.
export const actionChallengePurpose = (purpose: ActionPurpose) =>
  `action:${purpose}`;

export const actionPayloadSchema = z
  .object({
    passwordHash: z.string(),
    version: z.number().int(),
    lotId: z.uuid().optional(),
  })
  .strict();

export class VerificationRequiredError extends HttpException {
  constructor(purpose: ActionPurpose) {
    super(
      {
        code: VERIFICATION_REQUIRED,
        purpose,
        message:
          'Confirm it’s you: enter your password and the code we email you.',
      },
      403,
    );
  }
}

export function assertBiddingVerified(
  session: { bidVerifiedUntil: Date | null },
  now = Date.now(),
) {
  if (!session.bidVerifiedUntil || session.bidVerifiedUntil.getTime() <= now)
    throw new VerificationRequiredError('bidding');
}

// Call inside the protected action's transaction: the proof is consumed only
// if the action commits, and a concurrent second use waits on the row lock
// and then fails.
export async function consumeActionVerification(
  tx: Tx,
  identity: { userId: string; sessionId: string },
  purpose: Exclude<ActionPurpose, 'bidding'>,
  lotId: string,
  id: string,
  now = Date.now(),
) {
  // Same lock order as the rest of the money paths: user, session, proof.
  // Fences a concurrent password change or sign-out against this proof.
  await tx.$queryRaw`SELECT id FROM users WHERE id=${identity.userId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${identity.sessionId}::uuid FOR UPDATE`;
  const session = await tx.authSession.findFirst({
    where: {
      id: identity.sessionId,
      userId: identity.userId,
      revokedAt: null,
      expiresAt: { gt: new Date(now) },
    },
  });
  if (!session) throw new VerificationRequiredError(purpose);
  await tx.$queryRaw`SELECT id FROM account_security_challenges WHERE id=${id}::uuid FOR UPDATE`;
  const row = await tx.accountSecurityChallenge.findFirst({
    where: {
      id,
      userId: identity.userId,
      sessionId: identity.sessionId,
      purpose: actionChallengePurpose(purpose),
    },
  });
  if (
    !row ||
    !row.verifiedAt ||
    row.consumedAt ||
    row.expiresAt.getTime() <= now
  )
    throw new VerificationRequiredError(purpose);
  const payload = actionPayloadSchema.safeParse(
    JSON.parse(
      decryptPii(Buffer.from(row.payloadCiphertext), 'account-security'),
    ),
  );
  const user = await tx.user.findUniqueOrThrow({
    where: { id: identity.userId },
  });
  if (
    !payload.success ||
    payload.data.lotId !== lotId ||
    payload.data.passwordHash !== (user.buyerPasswordHash ?? '') ||
    payload.data.version !== user.authenticatorVersion
  )
    throw new VerificationRequiredError(purpose);
  const consumed = await tx.accountSecurityChallenge.updateMany({
    where: { id, consumedAt: null },
    data: { consumedAt: new Date(now) },
  });
  if (consumed.count !== 1) throw new VerificationRequiredError(purpose);
}
