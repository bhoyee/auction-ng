import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  relistSettingsSchema,
  relistSettingsUpdateSchema,
  unsoldRelistRules,
  type RelistSettings,
} from '@auction-ng/shared';
import type { Prisma } from '../generated/prisma/client';
import { requireStaffPermission } from '../auth/staff-access';
import { LedgerService } from '../ledger/ledger-service';
import { decryptPii, encryptPii } from '../security/pii';

type Tx = Prisma.TransactionClient;
type Row = {
  maxRetries: number;
  runHours: number;
  priceCutPercent: number;
  revision: number;
  updatedAt: Date;
};

const view = (row: Row): RelistSettings =>
  relistSettingsSchema.parse({
    maxRetries: row.maxRetries,
    runHours: row.runHours,
    priceCutPercent: row.priceCutPercent,
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
  });

// The rules every unsold relist uses. Falls back to the original defaults if
// the settings row is missing, so closing never fails for want of settings.
export async function relistRules(tx: Tx): Promise<RelistSettings> {
  const row = await tx.relistSettings.findUnique({ where: { id: 1 } });
  return row
    ? view(row)
    : {
        maxRetries: unsoldRelistRules.maxRetries,
        runHours: unsoldRelistRules.durationMs / 3_600_000,
        priceCutPercent: 0,
        revision: 0,
        updatedAt: new Date(0).toISOString(),
      };
}

// Unsold items settings (owner decision 2026-11-13). Same safety pattern as
// wallet controls: one row, revision check, idempotent retries, audit log.
export class RelistSettingsService {
  constructor(private readonly ledger: LedgerService) {}

  async read(actorId: string) {
    return this.ledger.db.$transaction(async (tx) => {
      await requireStaffPermission(tx, actorId, 'fees.manage');
      return relistRules(tx);
    });
  }

  async update(actorId: string, input: unknown) {
    const value = relistSettingsUpdateSchema.parse(input);
    return this.ledger.db.$transaction(async (tx) => {
      await requireStaffPermission(tx, actorId, 'fees.manage');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(531,2)`;
      const scope = 'relist-settings',
        key = actorId + ':' + value.idempotencyKey,
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
        return relistSettingsSchema.parse(
          JSON.parse(decryptPii(Buffer.from(prior.responseCiphertext), scope)),
        );
      }
      const before = await tx.relistSettings.findUniqueOrThrow({
        where: { id: 1 },
      });
      if (before.revision !== value.expectedRevision)
        throw new ConflictException(
          'Unsold item settings changed. Reload before saving.',
        );
      const result = view(
        await tx.relistSettings.update({
          where: { id: 1 },
          data: {
            maxRetries: value.maxRetries,
            runHours: value.runHours,
            priceCutPercent: value.priceCutPercent,
            revision: { increment: 1 },
            updatedAt: new Date(),
          },
        }),
      );
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'auctions.relist_settings_updated',
          entityType: 'relist_settings',
          entityId: value.idempotencyKey,
          beforeCiphertext: encryptPii(JSON.stringify(view(before)), 'audit'),
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
          responseCiphertext: encryptPii(JSON.stringify(result), scope),
        },
      });
      return result;
    });
  }
}
