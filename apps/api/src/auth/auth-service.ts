import {
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import {
  HttpException,
  UnauthorizedException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  profileSchema,
  type RequestCodeInput,
  type VerifyCodeInput,
  type RefreshInput,
  type Profile,
} from '@auction-ng/shared';
import { createDatabase } from '../database/client';
import type { Prisma } from '../generated/prisma/client';
import { decryptPii, encryptPii, hashPii } from '../security/pii';
import { MailpitEmailProvider, type EmailProvider } from './email-provider';

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
  readonly db: Db;
  readonly origins: string[];
  readonly local: boolean;
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
    this.local = (options.mode ?? process.env.AUTH_MODE) === 'local';
    this.provider = this.local
      ? (options.emailProvider ??
        new MailpitEmailProvider(
          process.env.MAILPIT_URL ?? 'http://localhost:8025',
        ))
      : undefined;
    this.now = options.now ?? Date.now;
  }
  async close() {
    await this.db.$disconnect();
  }
  async onModuleDestroy() {
    await this.close();
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
  async requestCode(input: RequestCodeInput, ip: string) {
    const provider = this.enabled();
    await this.rate('send-ip', ip, 20);
    await this.rate('send-global', 'all', 200, 60000);
    await this.rate('send-email', input.email, 3);
    const id = randomUUID();
    const code = randomInt(0, 1000000).toString().padStart(6, '0');
    const emailHash = hashPii(input.email, 'email');
    await this.db.$transaction(async (tx) => {
      // Serialize issuance per email so resends reliably invalidate older codes.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${emailHash},0))`;
      await tx.authChallenge.updateMany({
        where: { emailHash, consumedAt: null },
        data: { consumedAt: new Date(this.now()) },
      });
      await tx.authChallenge.create({
        data: {
          id,
          emailHash,
          emailCiphertext: encryptPii(input.email, 'email'),
          codeHash: hashPii(`${id}:${code}`, 'auth-otp'),
          deviceHash: this.device(input.deviceId, input.client),
          client: input.client,
          expiresAt: new Date(this.now() + CODE_MS),
        },
      });
    });
    try {
      await provider.sendCode(input.email, code);
    } catch {
      await this.db.authChallenge.update({
        where: { id },
        data: { consumedAt: new Date(this.now()) },
      });
      throw new ServiceUnavailableException(
        'Could not send the code. Please try again later.',
      );
    }
    return {
      challengeId: id,
      expiresInSeconds: CODE_MS / 1000,
      message: 'Check your email for a sign-in code.',
    };
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
    });
  }
  private async issue(
    tx: Tx,
    userId: string,
    deviceHash: string,
    client: string,
    familyId: string = randomUUID(),
    expiresAt = new Date(this.now() + SESSION_MS),
  ): Promise<SessionTokens> {
    const accessToken = randomBytes(32).toString('base64url');
    const refreshToken = randomBytes(32).toString('base64url');
    await tx.authSession.create({
      data: {
        userId,
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
    this.enabled();
    await this.rate('verify-ip', ip, 60);
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
        challenge.attempts >= 5
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
      const user = await tx.user.upsert({
        where: { emailHash: challenge.emailHash },
        create: {
          name: 'Auction buyer',
          emailHash: challenge.emailHash,
          emailCiphertext: Buffer.from(challenge.emailCiphertext),
          emailVerifiedAt: now,
        },
        update: { emailVerifiedAt: now },
      });
      await tx.authChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: now },
      });
      // Email-only login must not become a fallback around staff SSO/MFA.
      if (user.role !== 'buyer') return 'staff';
      return this.issue(tx, user.id, challenge.deviceHash, challenge.client);
    });
    if (result === 'staff')
      throw new ForbiddenException(
        'This account requires staff authentication.',
      );
    if (!result)
      throw new UnauthorizedException(
        'Code is invalid or expired. Request a new code.',
      );
    return result;
  }
  async limitCatalogueRequests(userId: string, ip: string) {
    await this.rate('catalogue-user', userId, 60, 60000);
    await this.rate('catalogue-ip', ip, 120, 60000);
  }
  async limitSearchRequests(ip: string) {
    await this.rate('search-ip', ip, 120, 60000);
  }
  async authenticate(
    token: string | undefined,
    deviceId: string | undefined,
  ): Promise<AuthIdentity> {
    this.enabled();
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token) || !deviceId)
      throw new UnauthorizedException('Sign in to continue.');
    const session = await this.db.authSession.findUnique({
      where: { accessHash: this.digest(token) },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.accessExpiresAt.getTime() <= this.now() ||
      session.expiresAt.getTime() <= this.now() ||
      session.deviceHash !== this.device(deviceId, session.client) ||
      session.user.role !== 'buyer'
    )
      throw new UnauthorizedException(
        'Your session has expired. Sign in again.',
      );
    return { user: this.profile(session.user), sessionId: session.id };
  }
  async refresh(
    input: RefreshInput,
    token: string | undefined,
    ip: string,
  ): Promise<SessionTokens> {
    this.enabled();
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
        await tx.authSession.updateMany({
          where: { familyId: session.familyId, revokedAt: null },
          data: { revokedAt: new Date(this.now()) },
        });
        return null;
      }
      if (
        session.expiresAt.getTime() <= this.now() ||
        session.user.role !== 'buyer'
      )
        return null;
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
      await tx.authSession.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date(this.now()) },
      });
    });
  }
  async updateProfile(identity: AuthIdentity, name: string): Promise<Profile> {
    await this.rate('profile-update', identity.user.id, 30, 60000);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${identity.user.id}::uuid FOR UPDATE`;
      const before = await tx.user.findUniqueOrThrow({
        where: { id: identity.user.id },
      });
      const after = await tx.user.update({
        where: { id: before.id },
        data: { name },
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
