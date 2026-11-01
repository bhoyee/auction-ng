import type { Prisma } from '../generated/prisma/client';
import { twoFactorProofSchema, type TwoFactorProof } from '@auction-ng/shared';
import { decryptPii, hashPii } from '../security/pii';
import { verifyTotp } from './staff-crypto';
import { HttpException } from '@nestjs/common';

export type FactorResult = 'not-enabled' | 'required' | 'invalid' | 'valid';
export function factorError(result: FactorResult) {
  return new HttpException(
    {
      code:
        result === 'required' ? 'TWO_FACTOR_REQUIRED' : 'TWO_FACTOR_INVALID',
      message:
        result === 'required'
          ? 'Enter your authenticator or recovery code.'
          : 'Check your authenticator or recovery code. Each code can be used once.',
    },
    422,
  );
}
// Call inside the action transaction: verification and the protected action commit together.
export async function consumeTwoFactor(
  tx: Prisma.TransactionClient,
  userId: string,
  proof?: TwoFactorProof,
  now = Date.now(),
): Promise<FactorResult> {
  await tx.$queryRaw`SELECT id FROM users WHERE id=${userId}::uuid FOR UPDATE`;
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.status !== 'active') return 'invalid';
  if (user.role === 'buyer' && !user.authenticatorEnabled) return 'not-enabled';
  if (!proof) return 'required';
  const parsed = twoFactorProofSchema.safeParse(proof);
  if (!parsed.success) return 'invalid';
  if (parsed.data.method === 'recovery') {
    const consumed = await tx.authRecoveryCode.updateMany({
      where: {
        userId,
        codeHash: hashPii(`${userId}:${parsed.data.code}`, 'auth-recovery'),
        usedAt: null,
      },
      data: { usedAt: new Date(now) },
    });
    if (consumed.count !== 1) return 'invalid';
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: 'security.recovery_code_used',
        entityType: 'user',
        entityId: userId,
      },
    });
    return 'valid';
  }
  const staff = user.role !== 'buyer';
  const credential = staff
    ? await tx.staffCredential.findUnique({ where: { userId } })
    : await tx.buyerAuthenticator.findUnique({ where: { userId } });
  if (!credential) return 'invalid';
  const encrypted =
    'totpSecretCiphertext' in credential
      ? credential.totpSecretCiphertext
      : credential.secretCiphertext;
  const counter = verifyTotp(
    decryptPii(Buffer.from(encrypted), staff ? 'staff-totp' : 'buyer-totp'),
    parsed.data.code,
    now,
    credential.lastCounter,
  );
  if (counter === null) return 'invalid';
  if (staff)
    await tx.staffCredential.update({
      where: { userId },
      data: { lastCounter: counter },
    });
  else
    await tx.buyerAuthenticator.update({
      where: { userId },
      data: { lastCounter: counter },
    });
  return 'valid';
}
