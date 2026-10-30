import {
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import {
  HttpException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  profileSchema,
  buyerAuthRateLimits,
  BID_PREPARE_LIMIT,
  BID_PREPARE_IP_LIMIT,
  type RequestCodeInput,
  type VerifyCodeInput,
  type RefreshInput,
  type Profile,
  type profilePatchSchema,
  type resetPasswordSchema,
  type changePasswordSchema,
  staffRoles,
  type staffSignInSchema,
} from '@auction-ng/shared';
import { createDatabase } from '../database/client';
import type { Prisma } from '../generated/prisma/client';
import { decryptPii, encryptPii, hashPii } from '../security/pii';
import { signInEmail, type EmailProvider } from './email-provider';
import { createMailDelivery } from '../email/mail-delivery';
import type { z } from 'zod';
import {
  hashStaffPassword as hashPassword,
  verifyStaffPassword,
  verifyTotp,
} from './staff-crypto';

const CODE_MS = 300000;
const ACCESS_MS = 900000;
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const RATE_MS = 900000;
type Db = ReturnType<typeof createDatabase>;
type Tx = Prisma.TransactionClient;
export interface AuthOptions {
  databaseUrl?: string;
  emailProvider?: EmailProvider;
  mode?: string;
  origins?: string[];
  now?: () => number;
}
export type AuthIdentity = { user: Profile; sessionId: string };
export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  user: Profile;
};
export class AuthService {
  beforeSessionRevocation: ((ids: string[]) => Promise<void>) | undefined;
  readonly db: Db;
  readonly origins: string[];
  readonly local: boolean;
  readonly staffOrigins = (
    process.env.STAFF_WEB_ORIGINS ?? 'http://localhost:3301'
  ).split(',');
  private readonly provider: EmailProvider | undefined;
  private readonly now: () => number;
  constructor(options: AuthOptions = {}) {
    this.db = createDatabase(options.databaseUrl ?? process.env.DATABASE_URL);
    this.origins =
      options.origins ??
      (
        process.env.AUTH_WEB_ORIGINS ??
        'http://localhost:3300,http://localhost:3301'
      ).split(',');
    const mode = options.mode ?? process.env.AUTH_MODE;
    this.local = mode === 'local';
    if (mode === 'local' || mode === 'smtp') {
      if (options.emailProvider) this.provider = options.emailProvider;
      else {
        const delivery = createMailDelivery(mode);
        this.provider = delivery
          ? {
              sendCode: (email, code, purpose) =>
                delivery.send(email, signInEmail(code, purpose)),
            }
          : undefined;
      }
    }
    this.now = options.now ?? Date.now;
  }
  async close() {
    await this.db.$disconnect();
  }
  async onModuleDestroy() {
    await this.close();
  }
  private async fenceSessions(tx: Tx, where: Prisma.AuthSessionWhereInput) {
    const sessions = await tx.authSession.findMany({
      where,
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    for (const session of sessions)
      await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${session.id}::uuid FOR UPDATE`;
    if (this.beforeSessionRevocation) {
      await this.beforeSessionRevocation(sessions.map((session) => session.id));
      await tx.$executeRaw`SELECT set_config('auction_ng.bid_fenced','on',true)`;
    }
  }
  private enabled() {
    if (!this.provider)
      throw new ServiceUnavailableException('Email login is not configured.');
    return this.provider;
  }
  private device(deviceId: string, client: string) {
    return hashPii(`${client}:${deviceId}`, 'auth-device');
  }
  private digest(token: string) {
    return hashPii(token, 'auth-token');
  }
  private async rate(
    scope: string,
    subject: string,
    limit: number,
    windowMs = RATE_MS,
  ) {
    const key = hashPii(`${scope}:${subject}`, 'auth-rate');
    const now = new Date(this.now());
    const expires = new Date(this.now() + windowMs);
    const rows = await this.db.$queryRaw<
      { count: number }[]
    >`INSERT INTO auth_rate_limits (key,count,expires_at) VALUES (${key},1,${expires}) ON CONFLICT (key) DO UPDATE SET count=CASE WHEN auth_rate_limits.expires_at<=${now} THEN 1 ELSE LEAST(auth_rate_limits.count+1,1000000) END,expires_at=CASE WHEN auth_rate_limits.expires_at<=${now} THEN ${expires} ELSE auth_rate_limits.expires_at END RETURNING count`;
    if ((rows[0]?.count ?? limit + 1) > limit)
      throw new HttpException('Too many attempts. Try again later.', 429);
  }
  async limitPaymentRequests(userId: string, ip: string) {
    await this.rate('payment-user', userId, 20);
    await this.rate('payment-ip', ip, 60);
  }
  async limitPaymentReads(userId: string, ip: string) {
    await this.rate('payment-read-user', userId, 240);
    await this.rate('payment-read-ip', ip, 720);
  }
  async limitWithdrawals(userId: string, ip: string, confirm = false) {
    await this.rate(
      confirm ? 'withdraw-confirm-user' : 'withdraw-user',
      userId,
      confirm ? 20 : 5,
    );
    await this.rate(
      confirm ? 'withdraw-confirm-ip' : 'withdraw-ip',
      ip,
      confirm ? 60 : 20,
    );
  }
  async sendWithdrawalCode(email: string, code: string) {
    await this.enabled().sendCode(email, code, 'withdraw');
  }
  async revokeLegacyBuyerSessions() {
    // Old email-only sessions must not retain funded bid preparations after
    // password authentication becomes mandatory. Use the existing Redis fence.
    for (;;) {
      const rows = await this.db.authSession.findMany({
        where: {
          buyerMfa: false,
          staffMfa: false,
          revokedAt: null,
          user: { role: 'buyer' },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 50,
      });
      if (!rows.length) return;
      await this.db.$transaction(async (tx) => {
        const where = {
          id: { in: rows.map((row) => row.id) },
          revokedAt: null,
        };
        await this.fenceSessions(tx, where);
        await tx.authSession.updateMany({
          where,
          data: { revokedAt: new Date(this.now()) },
        });
      });
    }
  }
  async limitPurchaseStatusRequests(userId: string, ip: string) {
    await this.rate('purchase-status-user', userId, 120, 60000);
    await this.rate('purchase-status-ip', ip, 300, 60000);
  }
  async requestCode(input: RequestCodeInput, ip: string) {
    const provider = this.enabled();
    await this.rate('send-ip', ip, 20);
    await this.rate('send-global', 'all', 200, 60000);
    await this.rate('send-email', input.email, 3);
    const limits = buyerAuthRateLimits[input.purpose];
    await this.rate(`buyer-${input.purpose}-ip`, ip, limits.ip);
    await this.rate(
      `buyer-${input.purpose}-device`,
      this.device(input.deviceId, input.client),
      limits.device,
    );
    if (input.purpose === 'signup') {
      await this.rate('buyer-signup-global', 'all', 50, 60000);
      if (input.website)
        throw new BadRequestException('Could not complete this request.');
    }
    const id = randomUUID();
    const acknowledgement = {
      challengeId: id,
      expiresInSeconds: CODE_MS / 1000,
      message:
        'If the details are eligible, check your email for a verification code.',
    };
    const code = randomInt(0, 1000000).toString().padStart(6, '0');
    const emailHash = hashPii(input.email, 'email');
    const user = await this.db.user.findUnique({ where: { emailHash } });
    let passwordHash: string | null = null;
    if (input.purpose === 'login') {
      const encoded =
        user?.buyerPasswordHash ??
        'scrypt32768r8p3$' + '0'.repeat(32) + '$' + '0'.repeat(64);
      const valid = await verifyStaffPassword(input.password, encoded);
      if (!valid || !user || user.role !== 'buyer' || user.status !== 'active')
        throw new UnauthorizedException('Invalid email or password.');
      passwordHash = encoded;
    } else if (input.purpose === 'signup') {
      if (user) return acknowledgement;
      passwordHash = await hashPassword(input.password);
    } else if (!user || user.role !== 'buyer' || user.status !== 'active')
      throw new BadRequestException(
        'No active buyer account was found for this email.',
      );
    const issued = await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${emailHash},0))`;
      const current = await tx.user.findUnique({ where: { emailHash } });
      if (
        input.purpose === 'signup'
          ? Boolean(current)
          : !current ||
            current.role !== 'buyer' ||
            current.status !== 'active' ||
            (input.purpose === 'login' &&
              current.buyerPasswordHash !== passwordHash)
      )
        return false;
      await tx.authChallenge.updateMany({
        where: { emailHash, consumedAt: null },
        data: { consumedAt: new Date(this.now()) },
      });
      await tx.authChallenge.create({
        data: {
          id,
          emailHash,
          emailCiphertext: encryptPii(input.email, 'email'),
          codeHash: hashPii(id + ':' + code, 'auth-otp'),
          deviceHash: this.device(input.deviceId, input.client),
          client: input.client,
          purpose: input.purpose,
          passwordHash,
          pendingName: input.purpose === 'signup' ? input.name : null,
          expiresAt: new Date(this.now() + CODE_MS),
        },
      });
      return true;
    });
    if (!issued) {
      if (input.purpose === 'reset')
        throw new BadRequestException(
          'No active buyer account was found for this email.',
        );
      return acknowledgement;
    }
    try {
      await provider.sendCode(input.email, code, input.purpose);
    } catch {
      await this.db.authChallenge.update({
        where: { id },
        data: { consumedAt: new Date(this.now()) },
      });
      throw new ServiceUnavailableException(
        'Could not send the code. Please try again later.',
      );
    }
    return acknowledgement;
  }

  private profile(user: {
    id: string;
    name: string;
    role: string;
    status: string;
    emailCiphertext: Uint8Array | null;
    emailVerifiedAt: Date | null;
    phoneCiphertext: Uint8Array | null;
    phoneVerifiedAt: Date | null;
    addressCiphertext?: Uint8Array | null;
    buyerPasswordHash?: string | null;
  }): Profile {
    return profileSchema.parse({
      id: user.id,
      name: user.name,
      role: user.role,
      status: user.status,
      email: user.emailCiphertext
        ? decryptPii(Buffer.from(user.emailCiphertext), 'email')
        : '',
      emailVerified: user.emailVerifiedAt !== null,
      phone: user.phoneCiphertext
        ? decryptPii(Buffer.from(user.phoneCiphertext), 'phone')
        : null,
      phoneVerified: user.phoneVerifiedAt !== null,
      address: user.addressCiphertext
        ? decryptPii(Buffer.from(user.addressCiphertext), 'address')
        : null,
      passwordSet: Boolean(user.buyerPasswordHash),
    });
  }
  private async issue(
    tx: Tx,
    userId: string,
    deviceHash: string,
    client: string,
    familyId: string = randomUUID(),
    expiresAt = new Date(this.now() + SESSION_MS),
    staffMfa = false,
  ): Promise<SessionTokens> {
    const accessToken = randomBytes(32).toString('base64url');
    const refreshToken = randomBytes(32).toString('base64url');
    await tx.authSession.create({
      data: {
        userId,
        staffMfa,
        buyerMfa: !staffMfa,
        deviceHash,
        client,
        familyId,
        accessHash: this.digest(accessToken),
        refreshHash: this.digest(refreshToken),
        accessExpiresAt: new Date(this.now() + ACCESS_MS),
        expiresAt,
      },
    });
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      accessToken,
      refreshToken,
      expiresInSeconds: ACCESS_MS / 1000,
      user: this.profile(user),
    };
  }
  async verifyCode(input: VerifyCodeInput, ip: string): Promise<SessionTokens> {
    const result = await this.completeChallenge(input, ip);
    if (result === 'changed') throw new UnauthorizedException();
    return result;
  }
  async resetPassword(input: z.infer<typeof resetPasswordSchema>, ip: string) {
    const result = await this.completeChallenge(input, ip, input.newPassword);
    if (result !== 'changed') throw new UnauthorizedException();
  }
  private async completeChallenge(
    input: VerifyCodeInput,
    ip: string,
    newPassword?: string,
  ): Promise<SessionTokens | 'changed'> {
    this.enabled();
    await this.rate('verify-ip', ip, 60);
    const replacement =
      newPassword === undefined ? undefined : await hashPassword(newPassword);
    const result = await this.db.$transaction(async (tx) => {
      const candidate = await tx.authChallenge.findUnique({
        where: { id: input.challengeId },
      });
      if (!candidate) return null;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${candidate.emailHash},0))`;
      await tx.$queryRaw`SELECT id FROM auth_challenges WHERE id=${input.challengeId}::uuid FOR UPDATE`;
      const challenge = await tx.authChallenge.findUnique({
        where: { id: input.challengeId },
      });
      if (
        !challenge ||
        challenge.consumedAt ||
        challenge.expiresAt.getTime() <= this.now() ||
        challenge.attempts >= 5 ||
        (replacement
          ? challenge.purpose !== 'reset'
          : !['login', 'signup'].includes(challenge.purpose))
      )
        return null;
      await tx.authChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      const digest = hashPii(`${challenge.id}:${input.code}`, 'auth-otp');
      if (
        !timingSafeEqual(
          Buffer.from(digest),
          Buffer.from(challenge.codeHash),
        ) ||
        challenge.deviceHash !== this.device(input.deviceId, input.client) ||
        challenge.client !== input.client
      )
        return null;
      const now = new Date(this.now());
      let user = await tx.user.findUnique({
        where: { emailHash: challenge.emailHash },
      });
      if (challenge.purpose === 'signup') {
        if (user || !challenge.passwordHash || !challenge.pendingName)
          return null;
        user = await tx.user.create({
          data: {
            name: challenge.pendingName,
            emailHash: challenge.emailHash,
            emailCiphertext: Buffer.from(challenge.emailCiphertext),
            emailVerifiedAt: now,
            buyerPasswordHash: challenge.passwordHash,
          },
        });
      }
      if (!user || user.role !== 'buyer' || user.status !== 'active')
        return null;
      await tx.$queryRaw`SELECT id FROM users WHERE id=${user.id}::uuid FOR UPDATE`;
      user = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (user.role !== 'buyer' || user.status !== 'active') return null;
      if (
        challenge.purpose === 'login' &&
        (!user.buyerPasswordHash ||
          user.buyerPasswordHash !== challenge.passwordHash)
      )
        return null;
      await tx.authChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: now },
      });
      if (replacement) {
        await this.replacePassword(tx, user.id, replacement);
        await tx.user.update({
          where: { id: user.id },
          data: { emailVerifiedAt: now },
        });
        return 'changed' as const;
      }
      await tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: now },
      });
      return this.issue(tx, user.id, challenge.deviceHash, challenge.client);
    });
    if (!result)
      throw new UnauthorizedException(
        'Code is invalid or expired. Request a new code.',
      );
    return result;
  }
  async staffSignIn(input: z.infer<typeof staffSignInSchema>, ip: string) {
    await this.rate('staff-sign-in-ip', ip, 20);
    await this.rate('staff-sign-in-email', input.email, 5);
    await this.rate('staff-sign-in-global', 'all', 100, 60000);
    const candidate = await this.db.user.findUnique({
      where: { emailHash: hashPii(input.email, 'email') },
      include: { staffCredential: true },
    });
    const encoded =
      candidate?.staffCredential?.passwordHash ??
      `scrypt32768r8p3$${'0'.repeat(32)}$${'0'.repeat(64)}`;
    const validPassword = await verifyStaffPassword(input.password, encoded);
    const invalid = () =>
      new UnauthorizedException(
        'Check your staff email, password and authenticator code.',
      );
    if (!validPassword || !candidate?.staffCredential) throw invalid();
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT user_id FROM staff_credentials WHERE user_id=${candidate.id}::uuid FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({
        where: { id: candidate.id },
        include: { staffCredential: true },
      });
      const credential = user.staffCredential;
      if (
        !credential ||
        credential.passwordHash !== encoded ||
        user.status !== 'active' ||
        !staffRoles.some((role) => role === user.role)
      )
        throw invalid();
      const counter = verifyTotp(
        decryptPii(Buffer.from(credential.totpSecretCiphertext), 'staff-totp'),
        input.code,
        this.now(),
        credential.lastCounter,
      );
      if (counter === null) throw invalid();
      await tx.staffCredential.update({
        where: { userId: user.id },
        data: { lastCounter: counter },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'staff.signed_in',
          entityType: 'user',
          entityId: user.id,
          afterCiphertext: encryptPii(
            JSON.stringify({ method: 'password_totp' }),
            'audit',
          ),
        },
      });
      return this.issue(
        tx,
        user.id,
        this.device(input.deviceId, 'web'),
        'web',
        randomUUID(),
        new Date(this.now() + 8 * 60 * 60 * 1000),
        true,
      );
    });
  }
  async limitCatalogueRequests(userId: string, ip: string) {
    await this.rate('catalogue-user', userId, 60, 60000);
    await this.rate('catalogue-ip', ip, 120, 60000);
  }
  async limitBidPreparations(userId: string, ip: string) {
    await this.rate('bid-prepare-user', userId, BID_PREPARE_LIMIT, 60000);
    await this.rate('bid-prepare-ip', ip, BID_PREPARE_IP_LIMIT, 60000);
  }
  async limitSearchRequests(ip: string) {
    await this.rate('search-ip', ip, 120, 60000);
  }
  async authenticate(
    token: string | undefined,
    deviceId: string | undefined,
  ): Promise<AuthIdentity> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token) || !deviceId)
      throw new UnauthorizedException('Sign in to continue.');
    const session = await this.db.authSession.findUnique({
      where: { accessHash: this.digest(token) },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      (session.user.role === 'buyer' &&
        (!session.buyerMfa || session.user.status !== 'active')) ||
      session.accessExpiresAt.getTime() <= this.now() ||
      session.expiresAt.getTime() <= this.now() ||
      session.deviceHash !== this.device(deviceId, session.client) ||
      ((session.staffMfa || session.user.role !== 'buyer') &&
        !(
          session.staffMfa &&
          staffRoles.some((role) => role === session.user.role) &&
          session.user.status === 'active'
        ))
    )
      throw new UnauthorizedException(
        'Your session has expired. Sign in again.',
      );
    return { user: this.profile(session.user), sessionId: session.id };
  }
  async realtimeSession(identity: AuthIdentity) {
    await this.rate('realtime-session', identity.user.id, 600);
    const session = await this.db.authSession.findUniqueOrThrow({
      where: { id: identity.sessionId },
    });
    if (
      session.userId !== identity.user.id ||
      session.revokedAt ||
      session.accessExpiresAt.getTime() <= this.now()
    )
      throw new UnauthorizedException();
    return {
      userId: identity.user.id,
      sessionId: session.id,
      expiresAt: new Date(
        Math.min(
          session.accessExpiresAt.getTime(),
          session.expiresAt.getTime(),
        ),
      ).toISOString(),
    };
  }
  async refresh(
    input: RefreshInput,
    token: string | undefined,
    ip: string,
    staff = false,
  ): Promise<SessionTokens> {
    if (!staff) this.enabled();
    await this.rate('refresh-ip', ip, 60);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new UnauthorizedException('Sign in again.');
    const result = await this.db.$transaction(async (tx) => {
      const hash = this.digest(token);
      const found = await tx.authSession.findUnique({
        where: { refreshHash: hash },
      });
      if (!found) return null;
      // Family lock serializes refresh, replay detection and logout across rotations.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${found.familyId},1))`;
      const session = await tx.authSession.findUniqueOrThrow({
        where: { id: found.id },
        include: { user: true },
      });
      if (
        session.deviceHash !== this.device(input.deviceId, input.client) ||
        session.client !== input.client
      )
        return null;
      if (session.revokedAt) {
        await this.fenceSessions(tx, {
          familyId: session.familyId,
          revokedAt: null,
        });
        await tx.authSession.updateMany({
          where: { familyId: session.familyId, revokedAt: null },
          data: { revokedAt: new Date(this.now()) },
        });
        return null;
      }
      if (
        session.expiresAt.getTime() <= this.now() ||
        (staff
          ? !session.staffMfa ||
            session.user.status !== 'active' ||
            !staffRoles.some((role) => role === session.user.role)
          : session.staffMfa ||
            !session.buyerMfa ||
            session.user.status !== 'active' ||
            session.user.role !== 'buyer')
      )
        return null;
      await this.fenceSessions(tx, { id: session.id });
      await tx.authSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date(this.now()) },
      });
      return this.issue(
        tx,
        session.userId,
        session.deviceHash,
        session.client,
        session.familyId,
        session.expiresAt,
        session.staffMfa,
      );
    });
    if (!result)
      throw new UnauthorizedException(
        'Your session has expired. Sign in again.',
      );
    return result;
  }
  async logout(input: RefreshInput, token: string | undefined, ip: string) {
    await this.rate('logout-ip', ip, 60);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
    await this.db.$transaction(async (tx) => {
      const session = await tx.authSession.findUnique({
        where: { refreshHash: this.digest(token) },
      });
      if (
        !session ||
        session.deviceHash !== this.device(input.deviceId, input.client)
      )
        return;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${session.familyId},1))`;
      await this.fenceSessions(tx, {
        familyId: session.familyId,
        revokedAt: null,
      });
      await tx.authSession.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date(this.now()) },
      });
      if (session.staffMfa)
        await tx.auditLog.create({
          data: {
            actorId: session.userId,
            action: 'staff.signed_out',
            entityType: 'user',
            entityId: session.userId,
            afterCiphertext: encryptPii(
              JSON.stringify({ revoked: true }),
              'audit',
            ),
          },
        });
    });
  }
  private async replacePassword(tx: Tx, userId: string, passwordHash: string) {
    await this.fenceSessions(tx, { userId, revokedAt: null });
    await tx.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(this.now()) },
    });
    const user = await tx.user.update({
      where: { id: userId },
      data: { buyerPasswordHash: passwordHash },
    });
    if (user.emailHash)
      await tx.authChallenge.updateMany({
        where: { emailHash: user.emailHash, consumedAt: null },
        data: { consumedAt: new Date(this.now()) },
      });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: 'buyer.password_changed',
        entityType: 'user',
        entityId: userId,
      },
    });
  }
  async changePassword(
    identity: AuthIdentity,
    input: z.infer<typeof changePasswordSchema>,
    ip: string,
  ) {
    if (identity.user.role !== 'buyer') throw new ForbiddenException();
    await this.rate('password-change-user', identity.user.id, 5);
    await this.rate('password-change-ip', ip, 20);
    const candidate = await this.db.user.findUniqueOrThrow({
      where: { id: identity.user.id },
    });
    if (
      !candidate.buyerPasswordHash ||
      !(await verifyStaffPassword(
        input.currentPassword,
        candidate.buyerPasswordHash,
      ))
    )
      throw new UnauthorizedException('Check your current password.');
    const encoded = await hashPassword(input.newPassword);
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${candidate.emailHash},0))`;
      await tx.$queryRaw`SELECT id FROM users WHERE id=${candidate.id}::uuid FOR UPDATE`;
      const current = await tx.user.findUniqueOrThrow({
        where: { id: candidate.id },
      });
      const session = await tx.authSession.findUnique({
        where: { id: identity.sessionId },
      });
      if (
        current.buyerPasswordHash !== candidate.buyerPasswordHash ||
        current.status !== 'active' ||
        current.role !== 'buyer' ||
        !session ||
        session.revokedAt ||
        session.accessExpiresAt.getTime() <= this.now()
      )
        throw new UnauthorizedException();
      await this.replacePassword(tx, current.id, encoded);
    });
  }
  async updateProfile(
    identity: AuthIdentity,
    value: string | z.infer<typeof profilePatchSchema>,
  ): Promise<Profile> {
    const input = typeof value === 'string' ? { name: value } : value;
    const { name } = input;
    await this.rate('profile-update', identity.user.id, 30, 60000);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${identity.user.id}::uuid FOR UPDATE`;
      const before = await tx.user.findUniqueOrThrow({
        where: { id: identity.user.id },
      });
      if (
        input.phone !== undefined &&
        before.phoneVerifiedAt &&
        (input.phone ? hashPii(input.phone, 'phone') : null) !==
          before.phoneHash
      )
        await this.fenceSessions(tx, { userId: before.id, revokedAt: null });
      const after = await tx.user.update({
        where: { id: before.id },
        data: {
          name,
          ...(input.phone !== undefined
            ? {
                phoneCiphertext: input.phone
                  ? encryptPii(input.phone, 'phone')
                  : null,
                phoneHash: input.phone ? hashPii(input.phone, 'phone') : null,
                ...((input.phone ? hashPii(input.phone, 'phone') : null) !==
                before.phoneHash
                  ? { phoneVerifiedAt: null }
                  : {}),
              }
            : {}),
          ...(input.address !== undefined
            ? {
                addressCiphertext: input.address
                  ? encryptPii(input.address, 'address')
                  : null,
              }
            : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: before.id,
          action: 'profile.update',
          entityType: 'user',
          entityId: before.id,
          beforeCiphertext: encryptPii(
            JSON.stringify({ name: before.name }),
            'audit',
          ),
          afterCiphertext: encryptPii(JSON.stringify({ name }), 'audit'),
        },
      });
      return this.profile(after);
    });
  }
}
