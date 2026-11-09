import type { CatalogueService } from '../catalogue/catalogue-service';
import { buildOverviewDemo, overviewDemoAllowed } from './overview-demo';
import { readAggregateOverview } from './overview-aggregates';
import {
  overviewResponseSchema,
  overviewWidgetPermissions,
  type OverviewQuery,
  type OverviewWidget,
} from '@auction-ng/shared';
import { staffCsvSchema } from '@auction-ng/shared';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import {
  staffRoleSaveSchema,
  staffInviteSchema,
  staffAssignmentSchema,
  staffArchiveSchema,
  staffBuyerActionSchema,
  staffRefundSchema,
  staffRecordQuerySchema,
  staffRecordPageSchema,
  staffDashboardSchema,
  staffAccessSchema,
  staffEnrollmentStartSchema,
  staffEnrollmentFinishSchema,
  staffMutationResultSchema,
  staffPermissionsFor,
  awaitingPickupStatuses,
  fromLedgerKobo,
  type StaffPermission,
  type StaffRow,
} from '@auction-ng/shared';
import type { Prisma } from '../generated/prisma/client';
import type { AuthIdentity, AuthService } from '../auth/auth-service';
import type { LedgerService } from '../ledger/ledger-service';
import { requireStaffPermission, staffAccess } from '../auth/staff-access';
import { encryptPii, decryptPii, hashPii } from '../security/pii';
import { newTotpSecret, hashStaffPassword } from '../auth/staff-crypto';
type Tx = Prisma.TransactionClient;
type Fence = { fenceEligibility: (tx: Tx, id: string) => Promise<unknown> };
const encode = (value: unknown) => encryptPii(JSON.stringify(value), 'audit');
const decode = (value: Uint8Array) =>
  JSON.parse(decryptPii(Buffer.from(value), 'audit')) as unknown;
const money = (v: bigint | null | undefined) => fromLedgerKobo(v ?? 0n);
const base = (r: { id: string; createdAt: Date; updatedAt?: Date }) => ({
  id: r.id,
  createdAt: r.createdAt.toISOString(),
  updatedAt: (r.updatedAt ?? r.createdAt).toISOString(),
});
export class StaffAdminService {
  async overviewWidget(
    who: AuthIdentity,
    widget: OverviewWidget,
    query: OverviewQuery,
  ) {
    return this.ledger.db.$transaction(
      async (tx) => {
        await this.actor(tx, who, 'dashboard.view');
        const permission: StaffPermission = overviewWidgetPermissions[widget];
        const access = await this.actor(tx, who, permission);
        const updatedAt = new Date().toISOString();
        if (overviewDemoAllowed(process.env)) {
          const data = buildOverviewDemo(widget, query);
          if (widget === 'attention')
            data.rows = data.rows.filter((row) => {
              const required: Record<string, StaffPermission> = {
                pickup: 'pickup.manage',
                inventory: 'inventory.read',
                finance: 'finance.read',
                support: 'support.manage',
                buyers: 'buyers.read',
              };
              return (
                row.destination &&
                access.permissions.includes(
                  required[row.destination] ?? 'dashboard.view',
                )
              );
            });
          return overviewResponseSchema.parse({
            widget,
            mode: 'demo',
            updatedAt,
            data,
          });
        }
        const result = await readAggregateOverview(tx, widget, query);
        if (widget === 'attention' && result.data) {
          const required: Record<string, StaffPermission> = {
            pickup: 'pickup.manage',
            inventory: 'inventory.read',
            finance: 'finance.read',
            support: 'support.manage',
            buyers: 'buyers.read',
          };
          result.data.rows = result.data.rows.filter(
            (row) =>
              row.destination &&
              access.permissions.includes(
                required[row.destination] ?? 'dashboard.view',
              ),
          );
        }
        return result;
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  constructor(
    readonly ledger: LedgerService,
    readonly auth: AuthService,
    readonly bids: Fence,
    readonly catalogue?: CatalogueService,
  ) {}
  async actor(tx: Tx, who: AuthIdentity, permission: StaffPermission) {
    const access = await requireStaffPermission(tx, who.user.id, permission);
    const session = await tx.authSession.findFirst({
      where: {
        id: who.sessionId,
        userId: who.user.id,
        OR: [{ staffAuthenticated: true }, { staffMfa: true }],
        revokedAt: null,
        authenticatorVersion: access.user.authenticatorVersion,
        accessExpiresAt: { gt: new Date() },
        expiresAt: { gt: new Date() },
      },
    });
    // Staff credentials establish staff access; enrolled accounts additionally need MFA proof.
    const credential = await tx.staffCredential.findUnique({
      where: { userId: who.user.id },
      select: { userId: true },
    });
    if (
      !session ||
      !credential ||
      (access.user.authenticatorEnabled && !session.staffMfa)
    )
      throw new UnauthorizedException('A verified staff session is required.');
    return access;
  }
  async images(who: AuthIdentity, id: string) {
    return this.ledger.db.$transaction(async (tx) => {
      await this.actor(tx, who, 'inventory.read');
      return {
        items: await tx.lotImage.findMany({
          where: { lotId: id },
          orderBy: { sortOrder: 'asc' },
          take: 20,
          select: {
            id: true,
            url: true,
            thumbnailUrl: true,
            sortOrder: true,
            width: true,
            height: true,
            thumbnailBytes: true,
          },
        }),
      };
    });
  }
  async me(who: AuthIdentity) {
    return this.ledger.db.$transaction(async (tx) => {
      const a = await staffAccess(tx, who.user.id);
      if (!a.permissions.length) throw new ForbiddenException();
      return staffAccessSchema.parse({
        name: a.user.name,
        roleName: a.roleName,
        permissions: a.permissions,
      });
    });
  }
  async mutation(
    who: AuthIdentity,
    value: { idempotencyKey: string; reason: string; id?: string },
    permission: StaffPermission,
    action: string,
    work: (
      tx: Tx,
    ) => Promise<{ id: string; message: string; invitationToken?: string }>,
    customSnapshot?: (tx: Tx, id: string) => Promise<unknown>,
  ) {
    return this.ledger.db.$transaction(
      async (tx) => {
        // Serialize staff administration; role/account writes cannot race their own checks.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(715,1)`;
        await this.actor(tx, who, permission);
        const hash = createHash('sha256')
          .update(JSON.stringify([action, value]))
          .digest('hex');
        const prior = await tx.staffAction.findUnique({
          where: { id: value.idempotencyKey },
        });
        if (prior) {
          if (prior.actorId !== who.user.id || prior.hash !== hash)
            throw new ConflictException(
              'This request key belongs to another action.',
            );
          return staffMutationResultSchema.parse(
            decode(prior.resultCiphertext),
          );
        }
        const snapshot = async (id?: string): Promise<unknown> => {
          if (!id) return null;
          if (customSnapshot) return customSnapshot(tx, id);
          if (
            action === 'role_saved' ||
            ('entity' in value && value.entity === 'role')
          )
            return tx.staffRole.findUnique({
              where: { id },
              select: {
                id: true,
                name: true,
                permissions: true,
                revision: true,
                archivedAt: true,
              },
            });
          if (action === 'purchase_refunded')
            return tx.invoice
              .findUnique({
                where: { id },
                select: { id: true, status: true, totalKobo: true },
              })
              .then((r) =>
                r ? { ...r, totalKobo: r.totalKobo.toString() } : null,
              );
          if (
            ['staff_invited', 'role_assigned'].includes(action) ||
            action.startsWith('buyer_')
          )
            return tx.user.findUnique({
              where: { id },
              select: {
                id: true,
                role: true,
                status: true,
                archivedAt: true,
                staffMembership: { select: { roleId: true } },
              },
            });
          if ('entity' in value && value.entity === 'lot')
            return tx.lot.findUnique({
              where: { id },
              select: { id: true, status: true, archivedAt: true },
            });
          if ('entity' in value && value.entity === 'user')
            return tx.user.findUnique({
              where: { id },
              select: { id: true, role: true, status: true, archivedAt: true },
            });
          return null;
        };
        const targetId =
          'id' in value && typeof value.id === 'string'
            ? value.id
            : 'invoiceId' in value && typeof value.invoiceId === 'string'
              ? value.invoiceId
              : undefined;
        const before = await snapshot(targetId);
        const result = staffMutationResultSchema.parse(await work(tx));
        const after = await snapshot(result.id);
        await tx.auditLog.create({
          data: {
            actorId: who.user.id,
            action: 'staff.' + action,
            entityType: action.startsWith('category_')
              ? 'category'
              : action.startsWith('location_')
                ? 'pickup-centre'
                : 'staff-operation',
            entityId: result.id,
            beforeCiphertext: encode(before),
            afterCiphertext: encode({
              input: { ...value, idempotencyKey: undefined },
              record: after,
            }),
          },
        });
        await tx.staffAction.create({
          data: {
            id: value.idempotencyKey,
            actorId: who.user.id,
            hash,
            resultCiphertext: encode(result),
          },
        });
        return result;
      },
      { timeout: 30000 },
    );
  }
  async saveRole(who: AuthIdentity, input: unknown) {
    const v = staffRoleSaveSchema.parse(input);
    return this.mutation(who, v, 'staff.manage', 'role_saved', async (tx) => {
      if (
        v.permissions.some((p) => ['staff.manage', 'records.purge'].includes(p))
      )
        throw new BadRequestException(
          'Root administration cannot be delegated.',
        );
      const key = v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (!key || (['admin', 'manager', 'support'].includes(key) && !v.id))
        throw new ConflictException('Use another role name.');
      if (v.id) {
        const old = await tx.staffRole.findUnique({ where: { id: v.id } });
        if (!old) throw new NotFoundException();
        if (
          old.key === 'admin' ||
          old.archivedAt ||
          old.revision !== v.expectedRevision
        )
          throw new ConflictException('Reload this role before editing.');
        await tx.staffRole.update({
          where: { id: v.id },
          data: {
            name: v.name,
            permissions: [...new Set(v.permissions)],
            revision: { increment: 1 },
            ...(old.builtIn ? {} : { key }),
          },
        });
        return { id: v.id, message: 'Role permissions updated.' };
      }
      const role = await tx.staffRole.create({
        data: {
          name: v.name,
          key,
          permissions: [...new Set(v.permissions)],
          createdById: who.user.id,
        },
      });
      return { id: role.id, message: 'Role created.' };
    });
  }
  async invite(who: AuthIdentity, input: unknown) {
    const v = staffInviteSchema.parse(input);
    return this.mutation(
      who,
      v,
      'staff.manage',
      'staff_invited',
      async (tx) => {
        const role = await tx.staffRole.findUnique({ where: { id: v.roleId } });
        if (!role || role.archivedAt)
          throw new ConflictException('Choose an active role.');
        const existing = await tx.user.findUnique({
          where: { emailHash: hashPii(v.email, 'email') },
          include: { staffCredential: true, staffMembership: true },
        });
        if (
          existing &&
          (existing.staffCredential ||
            !existing.staffMembership ||
            existing.status !== 'suspended' ||
            existing.archivedAt)
        )
          throw new ConflictException('This email already has an account.');
        const user =
          existing ??
          (await tx.user.create({
            data: {
              name: v.name,
              emailHash: hashPii(v.email, 'email'),
              emailCiphertext: encryptPii(v.email, 'email'),
              role:
                role.key === 'admin'
                  ? 'admin'
                  : role.key === 'support'
                    ? 'support'
                    : 'manager',
              status: 'suspended',
              staffMembership: { create: { roleId: role.id } },
            },
          }));
        if (existing) {
          if (existing.staffMembership?.roleId !== role.id)
            throw new ConflictException(
              'Reissue with the existing role; change the role after setup.',
            );
          await tx.staffInvitation.updateMany({
            where: { userId: user.id, usedAt: null },
            data: { usedAt: new Date() },
          });
        }
        const token = randomBytes(32).toString('base64url');
        await tx.staffInvitation.create({
          data: {
            userId: user.id,
            tokenHash: hashPii(token, 'staff-invite'),
            secretCiphertext: encryptPii(newTotpSecret(), 'staff-invite'),
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        return {
          id: user.id,
          message:
            'Staff invitation created. Share the private setup link securely.',
          invitationToken: token,
        };
      },
    );
  }
  async enrollStart(input: unknown) {
    const v = staffEnrollmentStartSchema.parse(input);
    const r = await this.ledger.db.staffInvitation.findUnique({
      where: { tokenHash: hashPii(v.token, 'staff-invite') },
      include: { user: true },
    });
    if (
      !r ||
      r.usedAt ||
      r.expiresAt <= new Date() ||
      r.attempts >= 5 ||
      !r.user.emailCiphertext
    )
      throw new BadRequestException(
        'This invitation is unavailable. Ask an administrator for a new invitation.',
      );
    const email = decryptPii(Buffer.from(r.user.emailCiphertext), 'email');
    return {
      email,
      name: r.user.name,
    };
  }
  async enrollFinish(input: unknown) {
    const v = staffEnrollmentFinishSchema.parse(input);
    const passwordHash = await hashStaffPassword(v.password);
    const result = await this.ledger.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(715,1)`;
      const row = await tx.staffInvitation.findUnique({
        where: { tokenHash: hashPii(v.token, 'staff-invite') },
        include: { user: true },
      });
      if (
        !row ||
        row.usedAt ||
        row.expiresAt <= new Date() ||
        row.attempts >= 5 ||
        row.user.archivedAt
      )
        throw new BadRequestException('This invitation is unavailable.');
      const member = await tx.staffMembership.findUniqueOrThrow({
        where: { userId: row.userId },
        include: { role: true },
      });
      if (member.role.archivedAt) throw new ForbiddenException();
      await this.bids.fenceEligibility(tx, row.userId);
      await tx.staffCredential.create({
        data: {
          userId: row.userId,
          passwordHash,
        },
      });
      await tx.user.update({
        where: { id: row.userId },
        data: {
          status: 'active',
          authenticatorEnabled: false,
          emailVerifiedAt: new Date(),
        },
      });
      await tx.staffInvitation.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: row.userId,
          action: 'staff.enrollment_completed',
          entityType: 'user',
          entityId: row.userId,
          afterCiphertext: encode({ mfa: false }),
        },
      });
      return true;
    });
    if (!result) throw new BadRequestException('Setup could not be confirmed.');
    return {
      id: 'enrolled',
      message: 'Staff account created. Sign in with your password.',
    };
  }
  async assign(who: AuthIdentity, input: unknown) {
    const v = staffAssignmentSchema.parse(input);
    return this.mutation(
      who,
      v,
      'staff.manage',
      'role_assigned',
      async (tx) => {
        const target = await tx.user.findUnique({ where: { id: v.id } }),
          role = await tx.staffRole.findUnique({ where: { id: v.roleId } });
        if (
          !target ||
          !role ||
          role.archivedAt ||
          target.role === 'buyer' ||
          target.role === 'supplier' ||
          target.archivedAt
        )
          throw new ConflictException(
            'Select an active staff account and role.',
          );
        if (target.updatedAt.toISOString() !== v.expectedUpdatedAt)
          throw new ConflictException('Reload the staff account.');
        await this.protectLastAdmin(
          tx,
          target.id,
          target.role,
          role.key === 'admin',
        );
        await this.bids.fenceEligibility(tx, target.id);
        await tx.user.update({
          where: { id: target.id },
          data: {
            role:
              role.key === 'admin'
                ? 'admin'
                : role.key === 'support'
                  ? 'support'
                  : 'manager',
          },
        });
        await tx.authSession.updateMany({
          where: { userId: target.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.staffMembership.upsert({
          where: { userId: target.id },
          create: { userId: target.id, roleId: role.id },
          update: { roleId: role.id },
        });
        return {
          id: target.id,
          message: 'Staff role updated. The staff member must sign in again.',
        };
      },
    );
  }
  private async protectLastAdmin(
    tx: Tx,
    id: string,
    role: string,
    keepingAdmin = false,
  ) {
    if (
      role === 'admin' &&
      !keepingAdmin &&
      (await tx.user.count({
        where: {
          role: 'admin',
          status: 'active',
          archivedAt: null,
          id: { not: id },
        },
      })) === 0
    )
      throw new ConflictException('Keep at least one active administrator.');
  }
  async buyerAction(who: AuthIdentity, input: unknown) {
    const v = staffBuyerActionSchema.parse(input);
    return this.mutation(
      who,
      v,
      'buyers.manage',
      'buyer_' + v.operation,
      async (tx) => {
        const user = await tx.user.findUnique({ where: { id: v.id } });
        if (!user || user.role === 'supplier' || user.archivedAt)
          throw new NotFoundException();
        if (user.role !== 'buyer') {
          await this.actor(tx, who, 'staff.manage');
          if (v.operation === 'strike')
            throw new BadRequestException(
              'Only buyer accounts receive strikes.',
            );
          await this.protectLastAdmin(
            tx,
            user.id,
            user.role,
            v.operation === 'activate',
          );
          if (
            v.operation === 'activate' &&
            !(await tx.staffCredential.findUnique({
              where: { userId: user.id },
            }))
          )
            throw new ConflictException('Complete staff enrollment first.');
        }
        if (user.updatedAt.toISOString() !== v.expectedUpdatedAt)
          throw new ConflictException('Reload the buyer before saving.');
        await this.bids.fenceEligibility(tx, user.id);
        if (v.operation === 'strike') {
          await tx.strike.create({
            data: {
              userId: user.id,
              issuedById: who.user.id,
              reference: 'staff:' + v.idempotencyKey,
              reason: encryptPii(v.reason, 'audit').toString('base64'),
            },
          });
          if (
            (await tx.strike.count({
              where: { userId: user.id, revokedAt: null },
            })) >= 3
          )
            await tx.user.update({
              where: { id: user.id },
              data: { status: 'suspended' },
            });
        } else {
          if (
            v.operation === 'activate' &&
            (await tx.strike.count({
              where: { userId: user.id, revokedAt: null },
            })) >= 3
          )
            throw new ConflictException(
              'Review the active strikes before reactivating this buyer.',
            );
          await tx.user.update({
            where: { id: user.id },
            data: {
              status: v.operation === 'activate' ? 'active' : 'suspended',
            },
          });
        }
        await tx.authSession.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return { id: user.id, message: 'Buyer account updated.' };
      },
    );
  }
  async archive(who: AuthIdentity, input: unknown) {
    const v = staffArchiveSchema.parse(input);
    return this.mutation(
      who,
      v,
      v.operation === 'purge' ? 'records.purge' : 'records.archive',
      'record_' + v.operation,
      async (tx) => {
        const archivedAt = v.operation === 'archive' ? new Date() : null;
        if (v.entity === 'role') {
          await this.actor(tx, who, 'staff.manage');
          const r = await tx.staffRole.findUnique({ where: { id: v.id } });
          if (
            !r ||
            r.builtIn ||
            r.updatedAt.toISOString() !== v.expectedUpdatedAt
          )
            throw new ConflictException(
              'Built-in or changed roles cannot be removed.',
            );
          if (await tx.staffMembership.count({ where: { roleId: r.id } }))
            throw new ConflictException(
              'Reassign staff before archiving a role.',
            );
          if (v.operation === 'purge') {
            if (!r.archivedAt)
              throw new ConflictException('Archive this role first.');
            await tx.staffRole.delete({ where: { id: r.id } });
          } else
            await tx.staffRole.update({
              where: { id: r.id },
              data: { archivedAt, revision: { increment: 1 } },
            });
        }
        if (v.entity === 'lot') {
          const r = await tx.lot.findUnique({ where: { id: v.id } });
          if (
            !r ||
            r.updatedAt.toISOString() !== v.expectedUpdatedAt ||
            !['draft', 'closed', 'cancelled'].includes(r.status)
          )
            throw new ConflictException(
              'Only inactive, unchanged lots can be archived.',
            );
          if (v.operation === 'purge') {
            if (r.status !== 'draft' || !r.archivedAt)
              throw new ConflictException(
                'Only archived unused drafts can be deleted.',
              );
            const refs = await Promise.all([
              tx.bid.count({ where: { lotId: r.id } }),
              tx.bidFundingIntent.count({ where: { lotId: r.id } }),
              tx.preBid.count({ where: { lotId: r.id } }),
              tx.purchase.count({ where: { lotId: r.id } }),
              tx.invoiceLine.count({ where: { lotId: r.id } }),
              tx.imageUpload.count({ where: { lotId: r.id } }),
              tx.lotImage.count({ where: { lotId: r.id } }),
              tx.watchlist.count({ where: { lotId: r.id } }),
            ]);
            if (refs.some(Boolean))
              throw new ConflictException(
                'This lot has linked history and must be retained.',
              );
            await tx.searchIndexJob.deleteMany({ where: { lotId: r.id } });
            await tx.lot.delete({ where: { id: r.id } });
          } else
            await tx.lot.update({ where: { id: r.id }, data: { archivedAt } });
        }
        if (v.entity === 'user') {
          await this.actor(tx, who, 'staff.manage');
          const r = await tx.user.findUnique({ where: { id: v.id } });
          if (
            !r ||
            r.updatedAt.toISOString() !== v.expectedUpdatedAt ||
            r.id === who.user.id
          )
            throw new ConflictException('Select another unchanged account.');
          if (v.operation === 'purge')
            throw new ConflictException(
              'Accounts retain security and transaction history and cannot be permanently deleted.',
            );
          await this.protectLastAdmin(tx, r.id, r.role);
          await this.bids.fenceEligibility(tx, r.id);
          await tx.user.update({
            where: { id: r.id },
            data: { archivedAt, status: 'suspended' },
          });
          await tx.authSession.updateMany({
            where: { userId: r.id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        return {
          id: v.id,
          message:
            v.operation === 'restore'
              ? 'Record restored.'
              : v.operation === 'purge'
                ? 'Unused record permanently deleted.'
                : 'Record archived.',
        };
      },
    );
  }
  async refund(who: AuthIdentity, input: unknown) {
    const v = staffRefundSchema.parse(input);
    return this.mutation(
      who,
      v,
      'refunds.manage',
      'purchase_refunded',
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM invoices WHERE id=${v.invoiceId}::uuid FOR UPDATE`;
        const invoice = await tx.invoice.findUnique({
          where: { id: v.invoiceId },
          include: {
            purchase: true,
            lines: true,
            fulfilment: true,
            user: { select: { emailCiphertext: true } },
          },
        });
        if (
          !invoice ||
          invoice.status !== 'paid' ||
          (await tx.staffRefund.findUnique({
            where: { invoiceId: v.invoiceId },
          }))
        )
          throw new ConflictException(
            'Only paid, unrefunded invoices can be refunded.',
          );
        if (
          invoice.fulfilment?.collectedAt ||
          (await tx.pickupCollectionItem.count({
            where: {
              invoiceLineId: { in: invoice.lines.map((line) => line.id) },
            },
          }))
        )
          throw new ConflictException(
            'Collected goods are not eligible for this refund workflow.',
          );
        const wallet = await tx.wallet.findUniqueOrThrow({
          where: { userId: invoice.userId },
        });
        await this.ledger.lockedBalances(tx, wallet.id);
        const references: Prisma.LedgerTransactionWhereInput[] =
          invoice.purchase
            ? [{ reference: 'purchase:debit:' + invoice.purchase.id }]
            : invoice.lines.flatMap((l) => [
                { reference: 'settlement:debit:' + l.lotId },
                { reference: { startsWith: 'settlement:' + l.lotId + ':' } },
              ]);
        if (!references.length)
          throw new ConflictException('Original charge needs finance review.');
        const charges = await tx.ledgerTransaction.findMany({
          where: {
            walletId: wallet.id,
            operation: { in: ['debit', 'capture'] },
            OR: references,
          },
          orderBy: { id: 'asc' },
          take: 501,
        });
        if (
          charges.length > 500 ||
          charges.reduce((sum, r) => sum + (r.amountKobo ?? 0n), 0n) !==
            invoice.totalKobo
        )
          throw new ConflictException(
            'Original charges do not match the invoice.',
          );
        for (const charge of charges) {
          if (charge.amountKobo === null) throw new ConflictException();
          await this.ledger.refundInTransaction(tx, {
            walletId: wallet.id,
            sourceTransactionId: charge.id,
            amountKobo: charge.amountKobo,
            idempotencyKey: 'staff-refund:' + invoice.id + ':' + charge.id,
            reference: 'staff-refund:' + invoice.id,
          });
        }
        await tx.staffRefund.create({
          data: {
            invoiceId: invoice.id,
            actorId: who.user.id,
            amountKobo: invoice.totalKobo,
            reasonCiphertext: encode({ reason: v.reason }),
          },
        });
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { status: 'refunded' },
        });
        if (invoice.fulfilment)
          await tx.fulfilment.update({
            where: { id: invoice.fulfilment.id },
            data: {
              status: 'cancelled',
              qrTokenHash: null,
              qrTokenCiphertext: null,
            },
          });
        await tx.notification.create({
          data: {
            userId: invoice.userId,
            channel: 'email',
            template: 'staff-refund-v1',
            reference: 'staff-refund:' + invoice.id,
            payloadCiphertext: encryptPii(
              JSON.stringify({
                emailCiphertext: invoice.user.emailCiphertext
                  ? Buffer.from(invoice.user.emailCiphertext).toString('base64')
                  : null,
                message: {
                  reference: invoice.number,
                  amountKobo: money(invoice.totalKobo),
                  walletUrl:
                    (process.env.PAYMENT_RETURN_ORIGIN ??
                      'http://localhost:3300') + '/wallet',
                },
              }),
              'notification',
            ),
          },
        });
        return {
          id: invoice.id,
          message: 'Purchase refunded to the buyer wallet.',
        };
      },
    );
  }
  async importDrafts(who: AuthIdentity, input: unknown) {
    const v = staffCsvSchema.parse(input);
    return this.mutation(
      who,
      v,
      'inventory.write',
      'drafts_imported',
      async (tx) => {
        if (!this.catalogue)
          throw new ConflictException('Intake is unavailable.');
        const ids: string[] = [];
        for (const row of v.rows) {
          const result = await this.catalogue.create(who.user.id, row, tx);
          ids.push(result.id);
        }
        return {
          id: ids[0] ?? '',
          message:
            ids.length +
            ' draft lots saved. Add photos and schedule them from Inventory.',
        };
      },
    );
  }
  async records(who: AuthIdentity, input: unknown) {
    return this.ledger.db.$transaction(async (tx) => {
      const v = staffRecordQuerySchema.parse(input),
        permission: StaffPermission = (
          {
            lots: 'inventory.read',
            buyers: 'buyers.read',
            staff: 'staff.manage',
            roles: 'staff.manage',
            invoices: 'finance.read',
            withdrawals: 'finance.read',
            audit: 'audit.read',
          } as const
        )[v.kind];
      await this.actor(tx, who, permission);
      let after: string | undefined;
      let afterAt: string | undefined;
      const scope = JSON.stringify([
        who.user.id,
        v.kind,
        v.view,
        v.status ?? '',
        v.search ?? '',
        v.location ?? '',
        v.bin ?? '',
      ]);
      if (v.cursor) {
        try {
          const c = z
            .object({
              id: z.uuid(),
              scope: z.string(),
              at: z.iso.datetime().optional(),
            })
            .strict()
            .parse(JSON.parse(Buffer.from(v.cursor, 'base64url').toString()));
          if (c.scope !== scope) throw Error();
          after = c.id;
          afterAt = c.at;
          if (v.kind === 'audit' && !afterAt) throw Error();
        } catch {
          throw new BadRequestException(
            'Use pagination with the same filters.',
          );
        }
      }
      const take = v.limit + 1,
        archivedAt = v.view === 'archived' ? { not: null } : null;
      const next = (id: string, at?: string) =>
        Buffer.from(JSON.stringify({ id, scope, at })).toString('base64url');
      let items: StaffRow[] = [];
      if (v.kind === 'lots') {
        const rows = await tx.lot.findMany({
          where: {
            archivedAt,
            ...(after ? { id: { gt: after } } : {}),
            ...(v.status ? { status: v.status } : {}),
            ...(v.location ? { locationId: v.location } : {}),
            ...(v.bin ? { binId: v.bin === 'none' ? null : v.bin } : {}),
            ...(v.search
              ? {
                  OR: [
                    { title: { contains: v.search, mode: 'insensitive' } },
                    { lotNumber: v.search },
                  ],
                }
              : {}),
          },
          orderBy: { id: 'asc' },
          take,
          include: {
            category: true,
            location: true,
            bin: { select: { code: true } },
            images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          },
        });
        items = rows.map((r) => ({
          ...base(r),
          title: r.title,
          reference: r.lotNumber,
          status: r.status,
          condition: r.condition,
          detail: r.category.name + ' · ' + r.location.name,
          amountKobo: money(r.startPriceKobo),
          imageUrl: r.images[0]?.thumbnailUrl ?? null,
          bin: r.bin?.code ?? null,
        }));
      }
      if (v.kind === 'buyers' || v.kind === 'staff') {
        const rows = await tx.user.findMany({
          where: {
            archivedAt,
            role:
              v.kind === 'buyers'
                ? 'buyer'
                : {
                    in: [
                      'admin',
                      'manager',
                      'support',
                      'intake',
                      'warehouse',
                      'finance',
                    ],
                  },
            ...(after ? { id: { gt: after } } : {}),
            ...(v.status ? { status: v.status } : {}),
            ...(v.search
              ? { name: { contains: v.search, mode: 'insensitive' } }
              : {}),
          },
          include: {
            staffMembership: { include: { role: true } },
            _count: { select: { strikes: { where: { revokedAt: null } } } },
          },
          orderBy: { id: 'asc' },
          take,
        });
        items = rows.map((r) => ({
          ...base(r),
          title: r.name,
          reference: r.id.slice(0, 8).toUpperCase(),
          status: r.status,
          detail:
            v.kind === 'buyers'
              ? `${r._count.strikes} active strikes`
              : (r.staffMembership?.role.name ?? r.role),
          ...(r.staffMembership ? { roleId: r.staffMembership.roleId } : {}),
        }));
      }
      if (v.kind === 'roles') {
        const rows = await tx.staffRole.findMany({
          where: {
            archivedAt,
            ...(after ? { id: { gt: after } } : {}),
            ...(v.search
              ? { name: { contains: v.search, mode: 'insensitive' } }
              : {}),
          },
          orderBy: { id: 'asc' },
          take,
          include: { _count: { select: { members: true } } },
        });
        items = rows.map((r) => ({
          ...base(r),
          title: r.name,
          reference: r.key,
          status: r.builtIn ? 'Core role' : 'Custom role',
          detail: `${r._count.members} assigned staff`,
          permissions: staffPermissionsFor(
            r.key === 'admin' ? 'admin' : 'manager',
            r.permissions,
          ),
          revision: r.revision,
        }));
      }
      if (v.kind === 'invoices') {
        const rows = await tx.invoice.findMany({
          where: {
            ...(after ? { id: { gt: after } } : {}),
            ...(v.status ? { status: v.status } : {}),
            ...(v.search
              ? { number: { contains: v.search, mode: 'insensitive' } }
              : {}),
          },
          orderBy: { id: 'asc' },
          take,
          include: {
            user: { select: { name: true } },
            purchase: { select: { id: true } },
          },
        });
        items = rows.map((r) => ({
          ...base(r),
          title: r.number,
          reference: r.number,
          status: r.status,
          detail: r.user.name + ' · ' + (r.purchase ? 'Buy Now' : 'Auction'),
          amountKobo: money(r.totalKobo),
        }));
      }
      if (v.kind === 'withdrawals') {
        const rows = await tx.withdrawal.findMany({
          where: {
            ...(after ? { id: { gt: after } } : {}),
            ...(v.status ? { status: v.status } : {}),
            ...(v.search
              ? { reference: { contains: v.search, mode: 'insensitive' } }
              : {}),
          },
          orderBy: { id: 'asc' },
          take,
          include: { user: { select: { name: true } } },
        });
        items = rows.map((r) => ({
          ...base(r),
          title: r.user.name,
          reference: r.reference,
          status: r.status,
          detail:
            r.processingIssue === 'provider_account'
              ? 'Provider action needed'
              : r.reviewRequired
                ? 'Manual review required'
                : 'Bank-funded request',
          amountKobo: money(r.amountKobo),
        }));
      }
      if (v.kind === 'audit') {
        const rows = await tx.auditLog.findMany({
          where: {
            ...(after && afterAt
              ? {
                  OR: [
                    { createdAt: { lt: new Date(afterAt) } },
                    { createdAt: new Date(afterAt), id: { lt: after } },
                  ],
                }
              : {}),
            ...(v.search
              ? {
                  AND: [
                    {
                      OR: [
                        { action: { contains: v.search, mode: 'insensitive' } },
                        {
                          entityId: { contains: v.search, mode: 'insensitive' },
                        },
                        {
                          actor: {
                            name: { contains: v.search, mode: 'insensitive' },
                          },
                        },
                        ...(z.uuid().safeParse(v.search).success
                          ? [{ actorId: v.search }]
                          : []),
                      ],
                    },
                  ],
                }
              : {}),
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take,
          include: { actor: { select: { name: true } } },
        });
        items = rows.map((r) => ({
          ...base(r),
          title: r.action,
          reference: r.entityId,
          status: r.entityType,
          detail:
            (r.actor?.name ?? 'System') + (r.actorId ? ' · ' + r.actorId : ''),
        }));
      }
      const hasNext = items.length > v.limit;
      items = items.slice(0, v.limit);
      const last = items.at(-1);
      return staffRecordPageSchema.parse({
        items,
        nextCursor:
          hasNext && last
            ? next(last.id, v.kind === 'audit' ? last.createdAt : undefined)
            : null,
      });
    });
  }
  async dashboard(who: AuthIdentity) {
    return this.ledger.db.$transaction(async (tx) => {
      await this.actor(tx, who, 'dashboard.view');
      const db = tx,
        since = new Date(Date.now() - 14 * 86400000);
      const [lots, pickup, support, paid, refunds, sales] = await Promise.all([
        db.lot.groupBy({
          by: ['status'],
          where: { archivedAt: null },
          _count: true,
        }),
        db.fulfilment.count({
          where: {
            type: 'pickup',
            collectedAt: null,
            status: { in: [...awaitingPickupStatuses] },
            invoice: { status: 'paid' },
          },
        }),
        db.supportConversation.count({
          where: { status: { in: ['open', 'in_progress'] } },
        }),
        db.invoice.aggregate({
          where: { status: 'paid', createdAt: { gte: since } },
          _sum: { totalKobo: true },
          _count: true,
        }),
        db.staffRefund.aggregate({
          where: { createdAt: { gte: since } },
          _sum: { amountKobo: true },
        }),
        db.$queryRaw<
          { day: string; amount: bigint; count: bigint }[]
        >`SELECT to_char(created_at AT TIME ZONE 'Africa/Lagos','YYYY-MM-DD') AS day, SUM(total_kobo) AS amount,COUNT(*) AS count FROM invoices WHERE status='paid' AND created_at>=${since} GROUP BY day ORDER BY day`,
      ]);
      const count = (status: string) =>
        lots.find((r) => r.status === status)?._count ?? 0;
      return staffDashboardSchema.parse({
        serverTime: new Date().toISOString(),
        metrics: {
          live: count('open') + count('closing'),
          scheduled: count('scheduled'),
          drafts: count('draft'),
          pickup,
          support,
          paidSalesKobo: money(paid._sum.totalKobo),
          refundsKobo: money(refunds._sum.amountKobo),
          paidOrders: paid._count,
        },
        sales: sales.map((r) => ({
          day: r.day,
          amountKobo: money(r.amount),
          count: Number(r.count),
        })),
        lots: lots.map((r) => ({ status: r.status, count: r._count })),
      });
    });
  }
}
