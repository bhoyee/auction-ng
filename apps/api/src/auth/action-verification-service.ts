import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  ACTION_CODE_TTL_MS,
  ACTION_VERIFICATION_TTL_MS,
  BIDDING_VERIFICATION_MS,
  actionVerifyChallengeSchema,
  actionVerifyFinishSchema,
  actionVerifyResultSchema,
  actionVerifyStartSchema,
  actionVerifyStatusSchema,
  type ActionPurpose,
  type ActionVerifyFinishInput,
  type ActionVerifyStartInput,
} from '@auction-ng/shared';
import type { Prisma } from '../generated/prisma/client';
import type { AuthIdentity, AuthService } from './auth-service';
import {
  actionChallengePurpose,
  actionPayloadSchema,
} from './action-verification-proof';
import { verifyStaffPassword } from './staff-crypto';
import { consumeTwoFactor, factorError } from './two-factor-proof';
import { decryptPii, encryptPii, hashPii } from '../security/pii';

type Tx = Prisma.TransactionClient;
const MAX_ATTEMPTS = 5;
const expired = () =>
  new BadRequestException('This check expired. Start again.');

export class ActionVerificationService {
  constructor(private readonly auth: AuthService) {}

  private async lock(tx: Tx, identity: AuthIdentity) {
    await tx.$queryRaw`SELECT id FROM users WHERE id=${identity.user.id}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${identity.sessionId}::uuid FOR UPDATE`;
    const now = new Date(this.auth.time());
    const user = await tx.user.findUniqueOrThrow({
      where: { id: identity.user.id },
    });
    const session = await tx.authSession.findFirst({
      where: {
        id: identity.sessionId,
        userId: user.id,
        revokedAt: null,
        accessExpiresAt: { gt: now },
        expiresAt: { gt: now },
        authenticatorVersion: user.authenticatorVersion,
      },
    });
    if (
      !session ||
      user.role !== 'buyer' ||
      user.status !== 'active' ||
      !user.emailVerifiedAt ||
      !user.emailCiphertext ||
      !user.buyerPasswordHash
    )
      throw new UnauthorizedException();
    return { user, session, passwordHash: user.buyerPasswordHash };
  }

  async status(identity: AuthIdentity) {
    const session = await this.auth.db.authSession.findUnique({
      where: { id: identity.sessionId },
    });
    const until = session?.bidVerifiedUntil;
    return actionVerifyStatusSchema.parse({
      biddingVerifiedUntil:
        until && until.getTime() > this.auth.time()
          ? until.toISOString()
          : null,
    });
  }

  async start(
    identity: AuthIdentity,
    input: ActionVerifyStartInput,
    ip: string,
  ) {
    await this.auth.securityRate(identity.user.id, ip);
    const value = actionVerifyStartSchema.parse(input);
    const candidate = await this.auth.db.user.findUniqueOrThrow({
      where: { id: identity.user.id },
    });
    // Same cost whether or not a password exists, so timing reveals nothing.
    const encoded =
      candidate.buyerPasswordHash ??
      `scrypt32768r8p3$${'0'.repeat(32)}$${'0'.repeat(64)}`;
    if (
      !(await verifyStaffPassword(value.password, encoded)) ||
      !candidate.buyerPasswordHash
    )
      throw new UnauthorizedException('Check your password.');
    const id = randomUUID();
    const code = randomInt(0, 1000000).toString().padStart(6, '0');
    const { row, email, twoFactorRequired } = await this.auth.db.$transaction(
      async (tx) => {
        const { user, passwordHash } = await this.lock(tx, identity);
        if (passwordHash !== encoded) throw new UnauthorizedException();
        const created = await tx.accountSecurityChallenge.create({
          data: {
            id,
            userId: user.id,
            sessionId: identity.sessionId,
            purpose: actionChallengePurpose(value.purpose),
            payloadCiphertext: encryptPii(
              JSON.stringify(
                actionPayloadSchema.parse({
                  passwordHash,
                  version: user.authenticatorVersion,
                  ...(value.lotId ? { lotId: value.lotId } : {}),
                }),
              ),
              'account-security',
            ),
            codeHash: hashPii(`${id}:${code}`, 'action-email'),
            expiresAt: new Date(this.auth.time() + ACTION_CODE_TTL_MS),
          },
        });
        return {
          row: created,
          email: decryptPii(Buffer.from(user.emailCiphertext ?? []), 'email'),
          twoFactorRequired: user.authenticatorEnabled,
        };
      },
    );
    await this.auth.sendSecurityCode(email, code);
    return actionVerifyChallengeSchema.parse({
      id: row.id,
      expiresAt: row.expiresAt.toISOString(),
      twoFactorRequired,
    });
  }

  async finish(
    identity: AuthIdentity,
    input: ActionVerifyFinishInput,
    ip: string,
  ) {
    await this.auth.securityRate(identity.user.id, ip);
    const value = actionVerifyFinishSchema.parse(input);
    // Failed attempts must commit, so failures are returned, then thrown.
    const result = await this.auth.db.$transaction(async (tx) => {
      const now = this.auth.time();
      const { user, passwordHash } = await this.lock(tx, identity);
      await tx.$queryRaw`SELECT id FROM account_security_challenges WHERE id=${value.id}::uuid FOR UPDATE`;
      const row = await tx.accountSecurityChallenge.findFirst({
        where: { id: value.id, userId: user.id, sessionId: identity.sessionId },
      });
      const purpose = row?.purpose.startsWith('action:')
        ? (row.purpose.slice('action:'.length) as ActionPurpose)
        : null;
      if (
        !row ||
        !purpose ||
        row.consumedAt ||
        row.verifiedAt ||
        row.expiresAt.getTime() <= now ||
        row.attempts >= MAX_ATTEMPTS
      )
        return { error: 'expired' as const };
      const payload = actionPayloadSchema.parse(
        JSON.parse(
          decryptPii(Buffer.from(row.payloadCiphertext), 'account-security'),
        ),
      );
      if (
        payload.passwordHash !== passwordHash ||
        payload.version !== user.authenticatorVersion
      )
        return { error: 'changed' as const };
      const fail = async () =>
        tx.accountSecurityChallenge.update({
          where: { id: row.id },
          data: { attempts: { increment: 1 } },
        });
      if (
        !timingSafeEqual(
          Buffer.from(row.codeHash),
          Buffer.from(hashPii(`${row.id}:${value.code}`, 'action-email')),
        )
      ) {
        await fail();
        return { error: 'code' as const };
      }
      const factor = await consumeTwoFactor(tx, user.id, value.factor, now);
      if (factor === 'required') return { factor };
      if (factor === 'invalid') {
        await fail();
        return { factor };
      }
      const verifiedAt = new Date(now);
      let biddingVerifiedUntil: Date | null = null;
      let expiresAt: Date;
      if (purpose === 'bidding') {
        biddingVerifiedUntil = new Date(now + BIDDING_VERIFICATION_MS);
        expiresAt = biddingVerifiedUntil;
        await tx.authSession.update({
          where: { id: identity.sessionId },
          data: { bidVerifiedUntil: biddingVerifiedUntil },
        });
        await tx.accountSecurityChallenge.update({
          where: { id: row.id },
          data: {
            emailVerifiedAt: verifiedAt,
            verifiedAt,
            consumedAt: verifiedAt,
          },
        });
      } else {
        expiresAt = new Date(now + ACTION_VERIFICATION_TTL_MS);
        await tx.accountSecurityChallenge.update({
          where: { id: row.id },
          data: { emailVerifiedAt: verifiedAt, verifiedAt, expiresAt },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'security.action_verified',
          entityType: 'user',
          entityId: user.id,
          afterCiphertext: encryptPii(
            JSON.stringify({
              purpose,
              lotId: payload.lotId ?? null,
              method:
                factor === 'valid' ? 'password_email_totp' : 'password_email',
            }),
            'audit',
          ),
        },
      });
      return {
        ok: actionVerifyResultSchema.parse({
          purpose,
          verificationId: purpose === 'bidding' ? null : row.id,
          biddingVerifiedUntil: biddingVerifiedUntil?.toISOString() ?? null,
          expiresAt: expiresAt.toISOString(),
        }),
      };
    });
    if ('ok' in result && result.ok) return result.ok;
    if ('factor' in result && result.factor) throw factorError(result.factor);
    if (result.error === 'code')
      throw new BadRequestException('Check the six-digit email code.');
    if (result.error === 'changed')
      throw new ForbiddenException(
        'Your password or security settings changed. Start again.',
      );
    throw expired();
  }
}
