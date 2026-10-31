import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  walletControlsSchema,
  walletControlsUpdateSchema,
  type WalletControlsUpdate,
} from '@auction-ng/shared';
import type { Prisma } from '../generated/prisma/client';
import { LedgerService } from '../ledger/ledger-service';
import { decryptPii, encryptPii } from '../security/pii';

export class WalletControlsService {
  constructor(private readonly ledger: LedgerService) {}
  async read() {
    const row = await this.ledger.db.walletControls.findUniqueOrThrow({
      where: { id: 1 },
    });
    return walletControlsSchema.parse({
      depositsEnabled: row.depositsEnabled,
      withdrawalsEnabled: row.withdrawalsEnabled,
      revision: row.revision,
      updatedAt: row.updatedAt.toISOString(),
    });
  }
  async admission(tx: Prisma.TransactionClient) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(531,1)`;
  }
  async assertNew(
    tx: Prisma.TransactionClient,
    kind: 'deposits' | 'withdrawals',
  ) {
    // Shared admission lock is held until the new intent commits; a pause takes the exclusive lock.
    await this.admission(tx);
    const row = await tx.walletControls.findUniqueOrThrow({ where: { id: 1 } });
    if (!(kind === 'deposits' ? row.depositsEnabled : row.withdrawalsEnabled))
      throw new ServiceUnavailableException(
        `New ${kind} are temporarily paused. Please try again later.`,
      );
  }
  async assertDeposits() {
    await this.ledger.db.$transaction((tx) => this.assertNew(tx, 'deposits'));
  }
  async update(actorId: string, input: WalletControlsUpdate) {
    const value = walletControlsUpdateSchema.parse(input);
    return this.ledger.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${actorId}::uuid FOR SHARE`;
      const actor = await tx.user.findFirst({
        where: { id: actorId, role: 'admin', status: 'active' },
      });
      if (!actor)
        throw new ForbiddenException(
          'Only active administrators can change wallet controls.',
        );
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(531,1)`;
      const key = actorId + ':' + value.idempotencyKey,
        scope = 'wallet-controls',
        requestHash = createHash('sha256')
          .update(JSON.stringify(value))
          .digest('hex');
      const prior = await tx.idempotencyKey.findUnique({
        where: { scope_key: { scope, key } },
      });
      if (prior) {
        if (prior.requestHash !== requestHash || !prior.responseCiphertext)
          throw new ConflictException(
            'This key belongs to another settings request.',
          );
        return walletControlsSchema.parse(
          JSON.parse(
            decryptPii(
              Buffer.from(prior.responseCiphertext),
              'wallet-controls',
            ),
          ),
        );
      }
      const before = await tx.walletControls.findUniqueOrThrow({
        where: { id: 1 },
      });
      if (before.revision !== value.expectedRevision)
        throw new ConflictException(
          'Wallet controls changed. Reload before saving.',
        );
      const after = await tx.walletControls.update({
        where: { id: 1 },
        data: {
          depositsEnabled: value.depositsEnabled,
          withdrawalsEnabled: value.withdrawalsEnabled,
          revision: { increment: 1 },
          updatedAt: new Date(),
        },
      });
      const result = walletControlsSchema.parse({
        depositsEnabled: after.depositsEnabled,
        withdrawalsEnabled: after.withdrawalsEnabled,
        revision: after.revision,
        updatedAt: after.updatedAt.toISOString(),
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'wallet.controls_updated',
          entityType: 'wallet_controls',
          entityId: value.idempotencyKey,
          beforeCiphertext: encryptPii(
            JSON.stringify({
              depositsEnabled: before.depositsEnabled,
              withdrawalsEnabled: before.withdrawalsEnabled,
              revision: before.revision,
            }),
            'audit',
          ),
          afterCiphertext: encryptPii(
            JSON.stringify({ ...result, reason: value.reason }),
            'audit',
          ),
        },
      });
      await tx.idempotencyKey.create({
        data: {
          userId: actorId,
          scope,
          key,
          requestHash,
          status: 'completed',
          responseCiphertext: encryptPii(
            JSON.stringify(result),
            'wallet-controls',
          ),
        },
      });
      return result;
    });
  }
}
