import { HttpException, UnauthorizedException } from '@nestjs/common';
import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  PURCHASE_UNLOCK_MS,
  purchaseUnlockChallengeSchema,
  purchaseUnlockFinishSchema,
  purchaseUnlockStartSchema,
  purchaseUnlockStatusSchema,
} from '@auction-ng/shared';
import type { Prisma } from '../generated/prisma/client';
import type { AuthIdentity, AuthService } from './auth-service';
import { verifyStaffPassword } from './staff-crypto';
import { consumeTwoFactor, factorError } from './two-factor-proof';
import { decryptPii, encryptPii, hashPii } from '../security/pii';

type Tx = Prisma.TransactionClient;
/** Shown to the buyer next to the named field. */
const fieldError = (field: string, message: string, status: 400 | 409) =>
  new HttpException({ code: 'FIELD_ERROR', field, message }, status);
const PURPOSE = 'purchase-unlock';
const CODE_MS = 5 * 60_000;
const payloadSchema = z
  .object({ passwordHash: z.string(), version: z.number().int() })
  .strict();

/**
 * Confirms the account owner before bids, pre-bids and Buy Now: password,
 * then a session-bound email code and the authenticator when it is on. Money
 * is never touched here; the protected actions check the result.
 */
export class PurchaseUnlockService {
  constructor(private readonly auth: AuthService) {}

  async status(identity: AuthIdentity) {
    const session = await this.auth.db.authSession.findFirst({
      where: { id: identity.sessionId, userId: identity.user.id },
      select: { purchaseUnlockedUntil: true },
    });
    const until = session?.purchaseUnlockedUntil;
    return purchaseUnlockStatusSchema.parse({
      unlockedUntil:
        until && until.getTime() > this.auth.time()
          ? until.toISOString()
          : null,
    });
  }

  /** The signed-in buyer, with this sign-in still valid. */
  private async lock(tx: Tx, identity: AuthIdentity) {
    await tx.$queryRaw`SELECT id FROM users WHERE id=${identity.user.id}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${identity.sessionId}::uuid FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({
      where: { id: identity.user.id },
    });
    const now = new Date(this.auth.time());
    const session = await tx.authSession.findFirst({
      where: {
        id: identity.sessionId,
        userId: user.id,
        revokedAt: null,
        buyerMfa: true,
        accessExpiresAt: { gt: now },
        expiresAt: { gt: now },
        authenticatorVersion: user.authenticatorVersion,
      },
    });
    if (
      !session ||
      user.role !== 'buyer' ||
      user.status !== 'active' ||
      !user.emailCiphertext ||
      !user.emailVerifiedAt
    )
      throw new UnauthorizedException();
    return user;
  }

  async start(
    identity: AuthIdentity,
    input: z.input<typeof purchaseUnlockStartSchema>,
    ip: string,
  ) {
    await this.auth.securityRate(identity.user.id, ip);
    const value = purchaseUnlockStartSchema.parse(input);
    const candidate = await this.auth.db.user.findUniqueOrThrow({
      where: { id: identity.user.id },
    });
    const encoded = candidate.buyerPasswordHash;
    if (
      candidate.role !== 'buyer' ||
      !encoded ||
      !(await verifyStaffPassword(value.password, encoded))
    )
      throw fieldError(
        'password',
        'That password isn’t right. Check it and try again.',
        400,
      );
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0'),
      id = randomUUID();
    const row = await this.auth.db.$transaction(async (tx) => {
      const user = await this.lock(tx, identity);
      if (user.buyerPasswordHash !== encoded) throw new UnauthorizedException();
      // One live request per sign-in: a new code replaces an older one.
      await tx.accountSecurityChallenge.updateMany({
        where: {
          sessionId: identity.sessionId,
          purpose: PURPOSE,
          consumedAt: null,
        },
        data: { consumedAt: new Date(this.auth.time()) },
      });
      return tx.accountSecurityChallenge.create({
        data: {
          id,
          userId: user.id,
          sessionId: identity.sessionId,
          purpose: PURPOSE,
          payloadCiphertext: encryptPii(
            JSON.stringify({
              passwordHash: encoded,
              version: user.authenticatorVersion,
            }),
            'account-security',
          ),
          codeHash: hashPii(`${id}:${code}`, 'security-email'),
          expiresAt: new Date(this.auth.time() + CODE_MS),
        },
      });
    });
    await this.auth.sendSecurityCode(
      decryptPii(Buffer.from(candidate.emailCiphertext ?? []), 'email'),
      code,
    );
    return purchaseUnlockChallengeSchema.parse({
      id,
      expiresAt: row.expiresAt.toISOString(),
      authenticator: candidate.authenticatorEnabled,
    });
  }

  async finish(
    identity: AuthIdentity,
    input: z.input<typeof purchaseUnlockFinishSchema>,
    ip: string,
  ) {
    await this.auth.securityRate(identity.user.id, ip);
    const value = purchaseUnlockFinishSchema.parse(input);
    // Wrong answers are counted in a transaction that commits, then refused.
    const outcome = await this.auth.db.$transaction(async (tx) => {
      const user = await this.lock(tx, identity);
      await tx.$queryRaw`SELECT id FROM account_security_challenges WHERE id=${value.id}::uuid FOR UPDATE`;
      const row = await tx.accountSecurityChallenge.findFirst({
        where: {
          id: value.id,
          userId: user.id,
          sessionId: identity.sessionId,
          purpose: PURPOSE,
        },
      });
      if (
        !row ||
        row.consumedAt ||
        row.expiresAt.getTime() <= this.auth.time() ||
        row.attempts >= 5
      )
        return { problem: 'expired' as const };
      const payload = payloadSchema.parse(
        JSON.parse(
          decryptPii(Buffer.from(row.payloadCiphertext), 'account-security'),
        ),
      );
      if (
        payload.passwordHash !== user.buyerPasswordHash ||
        payload.version !== user.authenticatorVersion
      )
        return { problem: 'changed' as const };
      const wrong = async () =>
        tx.accountSecurityChallenge.update({
          where: { id: row.id },
          data: { attempts: { increment: 1 } },
        });
      if (
        !timingSafeEqual(
          Buffer.from(row.codeHash),
          Buffer.from(hashPii(`${row.id}:${value.code}`, 'security-email')),
        )
      ) {
        await wrong();
        return { problem: 'code' as const };
      }
      const factor = await consumeTwoFactor(
        tx,
        user.id,
        value.factor,
        this.auth.time(),
      );
      if (factor === 'required' || factor === 'invalid') {
        if (factor === 'invalid') await wrong();
        return { factor };
      }
      const until = new Date(this.auth.time() + PURCHASE_UNLOCK_MS);
      await tx.authSession.update({
        where: { id: identity.sessionId },
        data: { purchaseUnlockedUntil: until },
      });
      await tx.accountSecurityChallenge.update({
        where: { id: row.id },
        data: {
          emailVerifiedAt: new Date(this.auth.time()),
          consumedAt: new Date(this.auth.time()),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'security.purchase_unlocked',
          entityType: 'user',
          entityId: user.id,
        },
      });
      return { until };
    });
    if ('factor' in outcome && outcome.factor)
      throw factorError(outcome.factor);
    if ('problem' in outcome) {
      if (outcome.problem === 'code')
        throw fieldError(
          'code',
          'That code isn’t right. Check the latest email from GiddyDeal and try again.',
          400,
        );
      throw fieldError(
        'form',
        outcome.problem === 'changed'
          ? 'Your password or security settings changed. Start again.'
          : 'This code expired or was tried too many times. Ask for a new code.',
        409,
      );
    }
    return purchaseUnlockStatusSchema.parse({
      unlockedUntil: outcome.until.toISOString(),
    });
  }
}
