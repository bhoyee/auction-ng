import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { z } from 'zod';
import {
  securityStartSchema,
  securityEmailSchema,
  securityFinishSchema,
  securityStatusSchema,
  securityEmailResultSchema,
  securityResultSchema,
  type TwoFactorProof,
} from '@auction-ng/shared';
import type { Prisma } from '../generated/prisma/client';
import type { AuthService, AuthIdentity } from './auth-service';
import { newTotpSecret, verifyStaffPassword, verifyTotp } from './staff-crypto';
import { consumeTwoFactor, factorError } from './two-factor-proof';
import { encryptPii, decryptPii, hashPii } from '../security/pii';

type Tx = Prisma.TransactionClient;
const payloadSchema = z
  .object({
    passwordHash: z.string(),
    version: z.number().int(),
    secret: z.string().optional(),
    binding: z.string().optional(),
  })
  .strict();
const passwordHash = (user: {
  buyerPasswordHash: string | null;
  staffCredential: { passwordHash: string } | null;
  role: string;
}) =>
  user.role === 'buyer'
    ? user.buyerPasswordHash
    : user.staffCredential?.passwordHash;
export class TwoFactorService {
  constructor(private readonly auth: AuthService) {}
  async status(identity: AuthIdentity) {
    const user = await this.auth.db.user.findUniqueOrThrow({
      where: { id: identity.user.id },
    });
    return securityStatusSchema.parse({
      enabled: user.role !== 'buyer' || user.authenticatorEnabled,
      mandatory: user.role !== 'buyer',
      recoveryCodesRemaining: await this.auth.db.authRecoveryCode.count({
        where: { userId: user.id, usedAt: null },
      }),
    });
  }
  private async lock(tx: Tx, identity: AuthIdentity) {
    await tx.$queryRaw`SELECT id FROM users WHERE id=${identity.user.id}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${identity.sessionId}::uuid FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({
      where: { id: identity.user.id },
      include: { staffCredential: true },
    });
    const session = await tx.authSession.findFirst({
      where: {
        id: identity.sessionId,
        userId: user.id,
        revokedAt: null,
        accessExpiresAt: { gt: new Date(this.auth.time()) },
        expiresAt: { gt: new Date(this.auth.time()) },
        authenticatorVersion: user.authenticatorVersion,
      },
    });
    if (
      !session ||
      user.status !== 'active' ||
      !user.emailCiphertext ||
      !user.emailVerifiedAt
    )
      throw new UnauthorizedException();
    return user;
  }
  async start(
    identity: AuthIdentity,
    input: z.input<typeof securityStartSchema>,
    ip: string,
  ) {
    await this.auth.securityRate(identity.user.id, ip);
    const value = securityStartSchema.parse(input);
    const candidate = await this.auth.db.user.findUniqueOrThrow({
      where: { id: identity.user.id },
      include: { staffCredential: true },
    });
    const encoded = passwordHash(candidate);
    if (!encoded || !(await verifyStaffPassword(value.password, encoded)))
      throw new UnauthorizedException('Check your password.');
    const code = randomInt(0, 1000000).toString().padStart(6, '0'),
      id = randomUUID();
    const row = await this.auth.db.$transaction(async (tx) => {
      const user = await this.lock(tx, identity);
      if (passwordHash(user) !== encoded) throw new UnauthorizedException();
      const enabled = user.role !== 'buyer' || user.authenticatorEnabled;
      if (value.purpose === 'disable' && user.role !== 'buyer')
        throw new ForbiddenException(
          'Staff and administrators must keep two-factor authentication enabled.',
        );
      if ((value.purpose === 'enable') === enabled)
        throw new ConflictException(
          'Refresh your security settings and try again.',
        );
      return tx.accountSecurityChallenge.create({
        data: {
          id,
          userId: user.id,
          sessionId: identity.sessionId,
          purpose: value.purpose,
          payloadCiphertext: encryptPii(
            JSON.stringify({
              passwordHash: encoded,
              version: user.authenticatorVersion,
              ...(['enable', 'rotate'].includes(value.purpose)
                ? { secret: newTotpSecret() }
                : {}),
              ...(value.newPassword
                ? { binding: hashPii(value.newPassword, 'security-password') }
                : {}),
            }),
            'account-security',
          ),
          codeHash: hashPii(`${id}:${code}`, 'security-email'),
          expiresAt: new Date(this.auth.time() + 300000),
        },
      });
    });
    await this.auth.sendSecurityCode(
      decryptPii(Buffer.from(candidate.emailCiphertext ?? []), 'email'),
      code,
    );
    return { id, expiresAt: row.expiresAt.toISOString() };
  }
  private async challenge(tx: Tx, identity: AuthIdentity, id: string) {
    const user = await this.lock(tx, identity);
    await tx.$queryRaw`SELECT id FROM account_security_challenges WHERE id=${id}::uuid FOR UPDATE`;
    const row = await tx.accountSecurityChallenge.findFirst({
      where: { id, userId: user.id, sessionId: identity.sessionId },
    });
    if (
      !row ||
      row.consumedAt ||
      row.expiresAt.getTime() <= this.auth.time() ||
      row.attempts >= 5
    )
      throw new BadRequestException(
        'This security request expired. Start again.',
      );
    const payload = payloadSchema.parse(
      JSON.parse(
        decryptPii(Buffer.from(row.payloadCiphertext), 'account-security'),
      ),
    );
    if (
      payload.passwordHash !== passwordHash(user) ||
      payload.version !== user.authenticatorVersion
    )
      throw new UnauthorizedException(
        'Your security settings changed. Start again.',
      );
    return { user, row, payload };
  }
  async verifyEmail(
    identity: AuthIdentity,
    input: z.input<typeof securityEmailSchema>,
    ip: string,
  ) {
    await this.auth.securityRate(identity.user.id, ip);
    const value = securityEmailSchema.parse(input);
    const result = await this.auth.db.$transaction(async (tx) => {
      const { user, row, payload } = await this.challenge(
        tx,
        identity,
        value.id,
      );
      if (
        !timingSafeEqual(
          Buffer.from(row.codeHash),
          Buffer.from(hashPii(`${row.id}:${value.code}`, 'security-email')),
        )
      ) {
        await tx.accountSecurityChallenge.update({
          where: { id: row.id },
          data: { attempts: { increment: 1 } },
        });
        return null;
      }
      await tx.accountSecurityChallenge.update({
        where: { id: row.id },
        data: { emailVerifiedAt: new Date(this.auth.time()) },
      });
      const email = decryptPii(
        Buffer.from(user.emailCiphertext ?? []),
        'email',
      );
      return securityEmailResultSchema.parse({
        verified: true,
        ...(payload.secret
          ? {
              secret: payload.secret,
              uri: `otpauth://totp/${encodeURIComponent('LotVanta:' + email)}?secret=${payload.secret}&issuer=LotVanta&algorithm=SHA1&digits=6&period=30`,
            }
          : {}),
      });
    });
    if (!result)
      throw new BadRequestException('Check the six-digit email code.');
    return result;
  }
  async finish(
    identity: AuthIdentity,
    input: z.input<typeof securityFinishSchema>,
    ip: string,
  ) {
    await this.auth.securityRate(identity.user.id, ip);
    const value = securityFinishSchema.parse(input);
    const result = await this.auth.db.$transaction(async (tx) => {
      const { user, row, payload } = await this.challenge(
        tx,
        identity,
        value.id,
      );
      if (!row.emailVerifiedAt || row.purpose === 'change-password')
        throw new ForbiddenException(
          'Verify your email and use the correct security action.',
        );
      if (user.role !== 'buyer' && row.purpose === 'disable')
        throw new ForbiddenException();
      const counter = payload.secret
        ? verifyTotp(payload.secret, value.newCode ?? '', this.auth.time())
        : null;
      if (payload.secret && counter === null) {
        await tx.accountSecurityChallenge.update({
          where: { id: row.id },
          data: { attempts: { increment: 1 } },
        });
        return { factor: 'invalid' as const };
      }
      const factor = await consumeTwoFactor(
        tx,
        user.id,
        value.factor,
        this.auth.time(),
      );
      if (factor === 'required' || factor === 'invalid') {
        if (factor === 'invalid')
          await tx.accountSecurityChallenge.update({
            where: { id: row.id },
            data: { attempts: { increment: 1 } },
          });
        return { factor };
      }
      if (payload.secret) {
        if (user.role === 'buyer')
          await tx.buyerAuthenticator.upsert({
            where: { userId: user.id },
            create: {
              userId: user.id,
              secretCiphertext: encryptPii(payload.secret, 'buyer-totp'),
              lastCounter: counter,
            },
            update: {
              secretCiphertext: encryptPii(payload.secret, 'buyer-totp'),
              lastCounter: counter,
              enabledAt: new Date(this.auth.time()),
            },
          });
        else
          await tx.staffCredential.update({
            where: { userId: user.id },
            data: {
              totpSecretCiphertext: encryptPii(payload.secret, 'staff-totp'),
              lastCounter: counter,
            },
          });
      }
      const enabled = row.purpose !== 'disable',
        version = user.authenticatorVersion + 1;
      await tx.user.update({
        where: { id: user.id },
        data: { authenticatorEnabled: enabled, authenticatorVersion: version },
      });
      await tx.authRecoveryCode.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date(this.auth.time()) },
      });
      const recoveryCodes = enabled
        ? Array.from(
            { length: 10 },
            () =>
              randomBytes(12)
                .toString('hex')
                .toUpperCase()
                .match(/.{4}/g)
                ?.join('-') ?? '',
          )
        : undefined;
      if (recoveryCodes)
        await tx.authRecoveryCode.createMany({
          data: recoveryCodes.map((code) => ({
            userId: user.id,
            codeHash: hashPii(`${user.id}:${code}`, 'auth-recovery'),
          })),
        });
      await tx.accountSecurityChallenge.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date(this.auth.time()) },
      });
      await this.auth.revokeForAuthenticator(
        tx,
        user.id,
        identity.sessionId,
        version,
      );
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: `security.authenticator_${row.purpose}`,
          entityType: 'user',
          entityId: user.id,
          afterCiphertext: encryptPii(
            JSON.stringify({ enabled, version }),
            'audit',
          ),
        },
      });
      return {
        result: securityResultSchema.parse({
          enabled,
          ...(recoveryCodes ? { recoveryCodes } : {}),
        }),
      };
    });
    if ('factor' in result && result.factor) throw factorError(result.factor);
    return result.result;
  }
  async authorisePassword(
    tx: Tx,
    identity: AuthIdentity,
    id: string | undefined,
    newPassword: string,
    factor?: TwoFactorProof,
  ) {
    if (!id) throw factorError('required');
    const { row, payload } = await this.challenge(tx, identity, id);
    if (
      row.purpose !== 'change-password' ||
      !row.emailVerifiedAt ||
      payload.binding !== hashPii(newPassword, 'security-password')
    )
      throw new ForbiddenException(
        'Use the verified request for this password change.',
      );
    const result = await consumeTwoFactor(
      tx,
      identity.user.id,
      factor,
      this.auth.time(),
    );
    if (result === 'required' || result === 'invalid')
      throw factorError(result);
    await tx.accountSecurityChallenge.update({
      where: { id },
      data: { consumedAt: new Date(this.auth.time()) },
    });
  }
}
