import { requireStaffPermission } from '../auth/staff-access';
import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  auctionFeePolicySchema,
  auctionFeeUpdateSchema,
  fromLedgerKobo,
  type AuctionFeePolicy,
  type AuctionFeeUpdate,
} from '@auction-ng/shared';
import type { createClient } from 'redis';
import type { AuthIdentity } from '../auth/auth-service';
import type { AuctionFeePolicy as StoredPolicy } from '../generated/prisma/client';
import { LedgerService } from '../ledger/ledger-service';
import { encryptPii } from '../security/pii';
import { ACTIVATE_AUCTION_FEES_LUA } from './auction-fee-lua';

export class AuctionFeeService {
  private readonly cache = new Map<string, AuctionFeePolicy>();
  constructor(
    private readonly ledger: LedgerService,
    private readonly redis: ReturnType<typeof createClient>,
    private readonly prefix: string,
  ) {}
  private dto(row: StoredPolicy) {
    return auctionFeePolicySchema.parse({
      version: row.version,
      serviceChargeEnabled: row.serviceChargeEnabled,
      premiumBps: row.premiumBps,
      lotFeeEnabled: row.lotFeeEnabled,
      lotFeeKobo: fromLedgerKobo(row.lotFeeKobo),
      vatEnabled: row.vatEnabled,
      vatBps: row.vatBps,
    });
  }
  async policy(version: string) {
    const cached = this.cache.get(version);
    if (cached) return cached;
    const row = await this.ledger.db.auctionFeePolicy.findUnique({
      where: { version },
    });
    if (!row)
      throw new ConflictException(
        'Unknown auction fee policy. Please contact support.',
      );
    const policy = Object.freeze(this.dto(row));
    this.cache.set(version, policy);
    return policy;
  }
  async activate() {
    const row = await this.ledger.db.auctionFeeControls.findUniqueOrThrow({
      where: { id: 1 },
      include: { policy: true },
    });
    await this.redis.eval(ACTIVATE_AUCTION_FEES_LUA, {
      keys: [this.prefix + 'auction-fees'],
      arguments: [String(row.policy.revision), row.currentVersion],
    });
  }
  async active() {
    const value = await this.redis.hGetAll(this.prefix + 'auction-fees');
    if (!value.version || !value.revision)
      throw new ServiceUnavailableException(
        'Auction fees are temporarily unavailable. Please retry.',
      );
    const row = await this.ledger.db.auctionFeePolicy.findUnique({
      where: { version: value.version },
    });
    if (!row || String(row.revision) !== value.revision)
      throw new ServiceUnavailableException(
        'Auction fees need reconciliation.',
      );
    return this.policy(row.version);
  }
  async read() {
    const row = await this.ledger.db.auctionFeeControls.findUniqueOrThrow({
      where: { id: 1 },
      include: { policy: true },
    });
    const active = this.redis.isReady
      ? await this.redis.hGet(this.prefix + 'auction-fees', 'version')
      : null;
    return {
      policy: this.dto(row.policy),
      revision: row.policy.revision,
      applied: active === row.currentVersion,
    };
  }
  async update(identity: AuthIdentity, input: AuctionFeeUpdate) {
    const value = auctionFeeUpdateSchema.parse(input);
    await this.ledger.db.$transaction(async (tx) => {
      await requireStaffPermission(tx, identity.user.id, 'fees.manage');
      await tx.$queryRaw`SELECT id FROM users WHERE id=${identity.user.id}::uuid FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({
        where: { id: identity.user.id },
      });
      const session = await tx.authSession.findFirst({
        where: {
          id: identity.sessionId,
          userId: user.id,
          revokedAt: null,
          OR: [{ staffAuthenticated: true }, { staffMfa: true }],
          accessExpiresAt: { gt: new Date() },
          expiresAt: { gt: new Date() },
          authenticatorVersion: user.authenticatorVersion,
        },
      });
      if (
        !session ||
        user.status !== 'active' ||
        (user.authenticatorEnabled && !session.staffMfa)
      )
        throw new ForbiddenException(
          'An active authorized staff session is required.',
        );
      await tx.$queryRaw`SELECT id FROM auction_fee_controls WHERE id=1 FOR UPDATE`;
      const scope = 'auction-fees',
        key = user.id + ':' + value.idempotencyKey;
      const requestHash = createHash('sha256')
        .update(JSON.stringify(value))
        .digest('hex');
      const prior = await tx.idempotencyKey.findUnique({
        where: { scope_key: { scope, key } },
      });
      if (prior) {
        if (prior.requestHash !== requestHash)
          throw new ConflictException(
            'This key belongs to another fee update.',
          );
        return;
      }
      const before = await tx.auctionFeeControls.findUniqueOrThrow({
        where: { id: 1 },
        include: { policy: true },
      });
      if (before.policy.revision !== value.expectedRevision)
        throw new ConflictException(
          'Auction fees changed. Reload the settings before saving.',
        );
      const version = 'af-' + randomUUID();
      const after = await tx.auctionFeePolicy.create({
        data: {
          version,
          revision: before.policy.revision + 1,
          createdById: user.id,
          serviceChargeEnabled: value.serviceChargeEnabled,
          premiumBps: value.premiumBps,
          lotFeeEnabled: value.lotFeeEnabled,
          lotFeeKobo: BigInt(value.lotFeeKobo),
          vatEnabled: value.vatEnabled,
          vatBps: value.vatBps,
        },
      });
      await tx.auctionFeeControls.update({
        where: { id: 1 },
        data: { currentVersion: version },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'auction.fees_updated',
          entityType: 'auction_fee_policy',
          entityId: value.idempotencyKey,
          beforeCiphertext: encryptPii(
            JSON.stringify(this.dto(before.policy)),
            'audit',
          ),
          afterCiphertext: encryptPii(
            JSON.stringify({ ...this.dto(after), reason: value.reason }),
            'audit',
          ),
        },
      });
      await tx.idempotencyKey.create({
        data: { userId: user.id, scope, key, requestHash, status: 'completed' },
      });
    });
    // Exact retries also activate the latest committed revision after a network failure.
    try {
      await this.activate();
    } catch {
      throw new ServiceUnavailableException(
        'Settings saved; activation is pending. Retry this same save.',
      );
    }
    return this.read();
  }
}
