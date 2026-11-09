import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type PickupStorageCase } from '../generated/prisma/client';
import type { AuthIdentity } from '../auth/auth-service';
import { StaffAdminService } from '../staff-admin/staff-admin-service';
import { LedgerService } from '../ledger/ledger-service';
import type {
  PaymentProvider,
  VerifiedTransfer,
} from '../payments/payment-provider';
import { encryptPii, decryptPii, hashPii } from '../security/pii';
import { paymentReturnUrl } from '../payments/payment-return-url';
import {
  storageCaseCharge,
  confirmStorageCollection,
} from './storage-collection';
import {
  pickupCalendarSchema,
  pickupStorageDates,
  pickupStorageExtensionDates,
  pickupStorageReminderTimes,
  storageCentreSaveSchema,
  storageCentreSchema,
  storageReadySchema,
  storageAdjustSchema,
  storagePageQuerySchema,
  storageCaseSchema,
  storageCasePageSchema,
  storagePaymentStartSchema,
  storagePaymentConfirmSchema,
  storagePaymentSchema,
  quotePurchasePayment,
  fromLedgerKobo,
  staffPermissionsFor,
  awaitingPickupStatuses,
  pickupPrepareQuerySchema,
  pickupPreparePageSchema,
  pickupPrepareCursor,
  parsePickupPrepareCursor,
  normalisePickupReference,
  PICKUP_PREPARE_WARN_HOURS,
  PICKUP_PREPARE_ALERT_HOURS,
} from '@auction-ng/shared';
type Tx = Prisma.TransactionClient;
const money = fromLedgerKobo;
const itemInclude = {
  lot: { select: { id: true, title: true, lotNumber: true, status: true } },
  invoice: {
    include: {
      user: { select: { id: true, name: true } },
      fulfilment: {
        include: { location: { select: { id: true, name: true } } },
      },
    },
  },
  collection: { include: { receipt: true } },
  storageCase: { include: { assignee: { select: { id: true, name: true } } } },
} satisfies Prisma.InvoiceLineInclude;
type Item = Prisma.InvoiceLineGetPayload<{ include: typeof itemInclude }>;
export class PickupStorageService {
  constructor(
    readonly ledger: LedgerService,
    readonly staff: StaffAdminService,
    readonly provider?: PaymentProvider,
    readonly now: () => Date = () => new Date(),
  ) {}
  charge(row: PickupStorageCase) {
    return storageCaseCharge(row, this.now());
  }
  private view(line: Item) {
    const row = line.storageCase,
      f = line.invoice.fulfilment;
    if (!f) throw new ConflictException('Pickup centre is unavailable.');
    const collectedAt =
      line.collection?.receipt.createdAt ??
      f.collectedAt ??
      row?.collectedAt ??
      null;
    const status = collectedAt
      ? 'collected'
      : !row
        ? 'not_started'
        : this.now() > row.reviewAt
          ? 'review'
          : this.now() > row.dueAt
            ? 'overdue'
            : this.now() >= row.reminderOneAt
              ? 'due_soon'
              : 'ready';
    return storageCaseSchema.parse({
      id: row?.id ?? null,
      invoiceLineId: line.id,
      lotId: line.lot.id,
      reference: line.lot.lotNumber,
      title: line.lot.title,
      invoiceNumber: line.invoice.number,
      buyerId: line.invoice.userId,
      buyerName: line.invoice.user.name,
      locationId: f.locationId,
      location: f.location.name,
      status,
      dueAt: row?.dueAt.toISOString() ?? null,
      reviewAt: row?.reviewAt.toISOString() ?? null,
      notifiedAt: row?.notifiedAt.toISOString() ?? null,
      collectedAt: collectedAt?.toISOString() ?? null,
      revision: row?.revision ?? 0,
      dailyKobo: row ? money(row.dailyKobo) : 0,
      capKobo: row ? money(row.capKobo) : 0,
      ...(row
        ? this.charge(row)
        : { days: 0, assessedKobo: 0, outstandingKobo: 0 }),
      paidKobo: row ? money(row.paidKobo) : 0,
      waived: row?.waived ?? false,
      assignedToId: row?.assignedToId ?? null,
      assignedToName: row?.assignee?.name ?? null,
    });
  }
  async centres(who: AuthIdentity, cursor?: string) {
    return this.ledger.db.$transaction(async (tx) => {
      await this.staff.actor(tx, who, 'pickup.manage');
      const rows = await tx.location.findMany({
        where: { archivedAt: null, ...(cursor ? { id: { gt: cursor } } : {}) },
        include: { storageCentre: true },
        orderBy: { id: 'asc' },
        take: 21,
      });
      return {
        items: rows.slice(0, 20).map((row) =>
          storageCentreSchema.parse({
            locationId: row.id,
            location: row.name,
            enabled: row.storageCentre?.enabled ?? false,
            dailyKobo: money(row.storageCentre?.dailyKobo ?? 100000n),
            capKobo: money(row.storageCentre?.capKobo ?? 1000000n),
            revision: row.storageCentre?.revision ?? 0,
            calendar: row.storageCentre
              ? pickupCalendarSchema.parse(row.storageCentre.calendar)
              : null,
          }),
        ),
        nextCursor: rows.length > 20 ? (rows[19]?.id ?? null) : null,
      };
    });
  }
  configure(who: AuthIdentity, input: unknown) {
    const v = storageCentreSaveSchema.parse(input);
    return this.staff.mutation(
      who,
      { ...v, id: v.locationId },
      'storage.manage',
      'storage_configured',
      async (tx) => {
        const location = await tx.location.findFirst({
          where: { id: v.locationId, archivedAt: null },
        });
        if (!location)
          throw new NotFoundException('Collection centre not found.');
        const previous = await tx.pickupStorageCentre.findUnique({
          where: { locationId: v.locationId },
        });
        if ((previous?.revision ?? 0) !== v.expectedRevision)
          throw new ConflictException(
            'Settings changed. Reload before saving.',
          );
        await tx.pickupStorageCentre.upsert({
          where: { locationId: v.locationId },
          create: {
            locationId: v.locationId,
            enabled: v.enabled,
            dailyKobo: BigInt(v.dailyKobo),
            capKobo: BigInt(v.capKobo),
            calendar: v.calendar,
          },
          update: {
            enabled: v.enabled,
            dailyKobo: BigInt(v.dailyKobo),
            capKobo: BigInt(v.capKobo),
            calendar: v.calendar,
            revision: { increment: 1 },
          },
        });
        return {
          id: v.locationId,
          message:
            'Storage policy saved. Existing item policy snapshots are unchanged.',
        };
      },
      async (tx, id) => {
        const row = await tx.pickupStorageCentre.findUnique({
          where: { locationId: id },
        });
        return row
          ? {
              ...row,
              dailyKobo: row.dailyKobo.toString(),
              capKobo: row.capKobo.toString(),
            }
          : null;
      },
    );
  }
  private async notice(tx: Tx, row: PickupStorageCase, phase: string) {
    const line = await tx.invoiceLine.findUniqueOrThrow({
      where: { id: row.invoiceLineId },
      include: { lot: true, invoice: { include: { user: true } } },
    });
    await tx.notification.createMany({
      data: [
        {
          userId: row.userId,
          channel: 'email',
          template: 'pickup-storage-v1',
          reference: `storage:${phase}:${row.id}:${row.termsRevision}`,
          payloadCiphertext: encryptPii(
            JSON.stringify({
              emailCiphertext: line.invoice.user.emailCiphertext
                ? Buffer.from(line.invoice.user.emailCiphertext).toString(
                    'base64',
                  )
                : null,
              message: {
                caseId: row.id,
                revision: row.termsRevision,
                phase,
                title: line.lot.title,
                lotNumber: line.lot.lotNumber,
                dueAt: row.dueAt.toISOString(),
                dailyKobo: money(row.dailyKobo),
                capKobo: money(row.capKobo),
                waived: row.waived,
              },
            }),
            'notification',
          ),
        },
      ],
      skipDuplicates: true,
    });
  }
  ready(who: AuthIdentity, input: unknown) {
    const v = storageReadySchema.parse(input);
    return this.staff.mutation(
      who,
      v,
      'pickup.manage',
      'storage_ready',
      async (tx) => {
        const rows = await tx.invoiceLine.findMany({
          where: { id: { in: v.lineIds } },
          include: itemInclude,
        });
        if (rows.length !== v.lineIds.length)
          throw new NotFoundException('One or more items are unavailable.');
        const ids = [...new Set(rows.map((r) => r.invoiceId))].sort();
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM invoices WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`,
        );
        for (const initial of rows) {
          const line = await tx.invoiceLine.findUniqueOrThrow({
            where: { id: initial.id },
            include: itemInclude,
          });
          const f = line.invoice.fulfilment;
          if (
            !f ||
            f.type !== 'pickup' ||
            line.invoice.status !== 'paid' ||
            line.lot.status !== 'closed' ||
            line.collection ||
            f.collectedAt ||
            !awaitingPickupStatuses.some((status) => status === f.status)
          )
            throw new ConflictException({
              code: 'PICKUP_STORAGE_NOT_ELIGIBLE',
              message:
                'Only sold, paid, uncollected pickup items can start a grace period.',
            });
          if (line.storageCase) continue;
          const policy = await tx.pickupStorageCentre.findUnique({
            where: { locationId: f.locationId },
          });
          if (!policy?.enabled)
            throw new ConflictException({
              code: 'PICKUP_STORAGE_POLICY_REQUIRED',
              message:
                'Configure and enable this centre storage calendar first.',
            });
          const calendar = pickupCalendarSchema.parse(policy.calendar),
            at = this.now();
          const dates = pickupStorageDates(at.toISOString(), calendar),
            reminders = pickupStorageReminderTimes(dates.dueAt, calendar);
          const first = reminders[0],
            second = reminders[1];
          if (!first || !second)
            throw new ConflictException('Reminder calendar is unavailable.');
          const row = await tx.pickupStorageCase.create({
            data: {
              invoiceLineId: line.id,
              userId: line.invoice.userId,
              locationId: f.locationId,
              dailyKobo: policy.dailyKobo,
              capKobo: policy.capKobo,
              calendar,
              policyRevision: policy.revision,
              readyAt: at,
              notifiedAt: at,
              originalDueAt: dates.dueAt,
              dueAt: dates.dueAt,
              reviewAt: dates.reviewAt,
              reminderOneAt: first,
              reminderTwoAt: second,
            },
          });
          await this.notice(tx, row, 'ready');
        }
        return {
          id: v.lineIds[0] ?? who.user.id,
          message:
            'Items ready. Fresh five-working-day grace periods and buyer notices are recorded.',
        };
      },
    );
  }
  /**
   * Read-only preparation queue: paid, uncollected pickup lines with no
   * storage case yet, oldest payment first. The fulfilment row is created in
   * the same transaction that marks the invoice paid, so its creation time is
   * the payment time. Nothing here starts a deadline or sends a notice.
   */
  async prepareQueue(who: AuthIdentity, input: unknown) {
    const v = pickupPrepareQuerySchema.parse(input),
      at = this.now();
    return this.ledger.db.$transaction(async (tx) => {
      await this.staff.actor(tx, who, 'pickup.manage');
      const statuses = Prisma.join([...awaitingPickupStatuses]);
      const base = Prisma.sql`FROM fulfilments f
        JOIN invoices i ON i.id=f.invoice_id
        JOIN invoice_lines il ON il.invoice_id=i.id
        JOIN lots l ON l.id=il.lot_id
        JOIN users u ON u.id=i.user_id
        JOIN locations loc ON loc.id=f.location_id
        LEFT JOIN pickup_storage_centres psc ON psc.location_id=f.location_id
        LEFT JOIN pickup_storage_cases sc ON sc.invoice_line_id=il.id
        LEFT JOIN pickup_collection_items pc ON pc.invoice_line_id=il.id
        WHERE f.type='pickup' AND f.collected_at IS NULL
          AND f.status IN (${statuses})
          AND i.status='paid' AND l.status='closed'
          AND sc.id IS NULL AND pc.invoice_line_id IS NULL`;
      const like = '%' + v.search.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
      const cursor = v.cursor ? parsePickupPrepareCursor(v.cursor) : null;
      const filters = [
        v.locationId ? Prisma.sql`f.location_id=${v.locationId}::uuid` : null,
        v.reference
          ? Prisma.sql`upper(l.lot_number)=${normalisePickupReference(v.reference)}`
          : null,
        v.search
          ? Prisma.sql`(l.title ILIKE ${like} OR l.lot_number ILIKE ${like} OR i.number ILIKE ${like} OR u.name ILIKE ${like})`
          : null,
        cursor
          ? Prisma.sql`(f.created_at, il.id) > (${new Date(cursor.paidAt)}::timestamptz, ${cursor.invoiceLineId}::uuid)`
          : null,
      ].filter((f): f is Prisma.Sql => f !== null);
      const rows = await tx.$queryRaw<
        {
          line_id: string;
          lot_id: string;
          reference: string;
          title: string;
          invoice_number: string;
          buyer_name: string;
          location_id: string;
          location: string;
          paid_at: Date;
          thumbnail: string | null;
          policy_enabled: boolean;
        }[]
      >`SELECT il.id AS line_id, l.id AS lot_id, l.lot_number AS reference,
          l.title, i.number AS invoice_number, u.name AS buyer_name,
          f.location_id, loc.name AS location, f.created_at AS paid_at,
          (SELECT coalesce(li.thumbnail_url, li.url) FROM lot_images li
            WHERE li.lot_id=l.id ORDER BY li.sort_order LIMIT 1) AS thumbnail,
          coalesce(psc.enabled, false) AS policy_enabled
        ${base}
          ${filters.length ? Prisma.sql`AND ${Prisma.join(filters, ' AND ')}` : Prisma.empty}
        ORDER BY f.created_at, il.id
        LIMIT ${v.limit + 1}`;
      const centres = await tx.$queryRaw<
        {
          location_id: string;
          location: string;
          count: bigint;
          over_warn: bigint;
          over_alert: bigint;
          oldest: Date;
          policy_enabled: boolean;
        }[]
      >`SELECT f.location_id, loc.name AS location, count(*)::bigint AS count,
          count(*) FILTER (WHERE f.created_at <= ${at}::timestamptz - make_interval(hours => ${PICKUP_PREPARE_WARN_HOURS}::int))::bigint AS over_warn,
          count(*) FILTER (WHERE f.created_at <= ${at}::timestamptz - make_interval(hours => ${PICKUP_PREPARE_ALERT_HOURS}::int))::bigint AS over_alert,
          min(f.created_at) AS oldest,
          coalesce(bool_or(psc.enabled), false) AS policy_enabled
        ${base}
        GROUP BY f.location_id, loc.name
        ORDER BY count(*) DESC, loc.name
        LIMIT 50`;
      const page = rows.slice(0, v.limit),
        last = page.at(-1);
      const n = (value: bigint) => fromLedgerKobo(value);
      const oldest = centres.reduce<Date | null>(
        (min, c) => (!min || c.oldest < min ? c.oldest : min),
        null,
      );
      return pickupPreparePageSchema.parse({
        items: page.map((r) => ({
          invoiceLineId: r.line_id,
          lotId: r.lot_id,
          reference: r.reference,
          title: r.title,
          invoiceNumber: r.invoice_number,
          buyerName: r.buyer_name,
          locationId: r.location_id,
          location: r.location,
          paidAt: r.paid_at.toISOString(),
          thumbnailUrl: r.thumbnail,
          policyEnabled: r.policy_enabled,
        })),
        nextCursor:
          rows.length > v.limit && last
            ? pickupPrepareCursor(last.paid_at.toISOString(), last.line_id)
            : null,
        serverTime: at.toISOString(),
        summary: {
          total: centres.reduce((sum, c) => sum + n(c.count), 0),
          overWarn: centres.reduce((sum, c) => sum + n(c.over_warn), 0),
          overAlert: centres.reduce((sum, c) => sum + n(c.over_alert), 0),
          oldestPaidAt: oldest?.toISOString() ?? null,
          centres: centres.map((c) => ({
            locationId: c.location_id,
            location: c.location,
            count: n(c.count),
            policyEnabled: c.policy_enabled,
          })),
        },
      });
    });
  }
  async buyerList(userId: string, input: unknown) {
    return this.list(userId, input);
  }
  async staffList(who: AuthIdentity, input: unknown) {
    return this.ledger.db.$transaction(async (tx) => {
      await this.staff.actor(tx, who, 'pickup.manage');
      return this.list(undefined, input, tx, who.user.id);
    });
  }
  private async list(
    userId: string | undefined,
    input: unknown,
    tx: Tx | LedgerService['db'] = this.ledger.db,
    staffId?: string,
  ) {
    const v = storagePageQuerySchema.parse(input),
      at = this.now();
    const state: Prisma.PickupStorageCaseWhereInput =
      v.view === 'review'
        ? { collectedAt: null, reviewAt: { lt: at } }
        : v.view === 'overdue'
          ? { collectedAt: null, dueAt: { lt: at }, reviewAt: { gte: at } }
          : v.view === 'due_soon'
            ? {
                collectedAt: null,
                dueAt: { gte: at },
                reminderOneAt: { lte: at },
              }
            : v.view === 'ready'
              ? { collectedAt: null, reminderOneAt: { gt: at } }
              : v.view === 'assigned'
                ? { assignedToId: staffId ?? userId, collectedAt: null }
                : {};
    const rows = await tx.invoiceLine.findMany({
      where: {
        ...(v.cursor ? { id: { gt: v.cursor } } : {}),
        lot: { status: 'closed' },
        invoice: {
          status: 'paid',
          ...(userId ? { userId } : {}),
          fulfilment: {
            is: {
              type: 'pickup',
              status: {
                in: [
                  ...awaitingPickupStatuses,
                  ...(['all', 'collected'].includes(v.view)
                    ? ['collected']
                    : []),
                ],
              },
              ...(!['all', 'collected'].includes(v.view)
                ? { collectedAt: null }
                : {}),
            },
          },
        },
        ...(v.view === 'not_started'
          ? {
              storageCase: null,
              collection: null,
              invoice: {
                status: 'paid',
                ...(userId ? { userId } : {}),
                fulfilment: {
                  is: {
                    type: 'pickup',
                    collectedAt: null,
                    status: { in: [...awaitingPickupStatuses] },
                  },
                },
              },
            }
          : {}),
        ...(v.view === 'collected'
          ? {
              OR: [
                { storageCase: { is: { collectedAt: { not: null } } } },
                { collection: { isNot: null } },
                {
                  invoice: {
                    fulfilment: { is: { collectedAt: { not: null } } },
                  },
                },
              ],
            }
          : !['all', 'not_started'].includes(v.view)
            ? { storageCase: { is: state }, collection: null }
            : {}),
        ...(v.search
          ? {
              AND: [
                {
                  OR: [
                    {
                      lot: {
                        title: { contains: v.search, mode: 'insensitive' },
                      },
                    },
                    {
                      lot: {
                        lotNumber: { contains: v.search, mode: 'insensitive' },
                      },
                    },
                    {
                      invoice: {
                        number: { contains: v.search, mode: 'insensitive' },
                      },
                    },
                    ...(staffId
                      ? [
                          {
                            invoice: {
                              user: {
                                name: {
                                  contains: v.search,
                                  mode: 'insensitive' as const,
                                },
                              },
                            },
                          },
                        ]
                      : []),
                  ],
                },
              ],
            }
          : {}),
      },
      include: itemInclude,
      orderBy: { id: 'asc' },
      take: v.limit + 1,
    });
    return storageCasePageSchema.parse({
      items: rows.slice(0, v.limit).map((r) => this.view(r)),
      nextCursor:
        rows.length > v.limit ? (rows[v.limit - 1]?.id ?? null) : null,
      serverTime: at.toISOString(),
    });
  }
  private async lock(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM pickup_storage_cases WHERE id=${id}::uuid FOR UPDATE`;
    const row = await tx.pickupStorageCase.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Storage case not found.');
    return row;
  }
  adjust(who: AuthIdentity, input: unknown) {
    const v = storageAdjustSchema.parse(input);
    return this.staff.mutation(
      who,
      { ...v, id: v.caseId },
      v.action === 'assign' || v.action === 'contact'
        ? 'pickup.manage'
        : 'storage.adjust',
      'storage_' + v.action,
      async (tx) => {
        const row = await this.lock(tx, v.caseId);
        if (row.collectedAt || row.revision !== v.expectedRevision)
          throw new ConflictException(
            'This item changed or was collected. Reload before changing it.',
          );
        if (
          ['extend', 'waive'].includes(v.action) &&
          (await tx.pickupStoragePayment.count({
            where: {
              caseId: row.id,
              status: 'pending',
              expiresAt: { gt: this.now() },
            },
          }))
        )
          throw new ConflictException(
            'Finish or cancel the pending storage checkout before adjusting charges.',
          );
        const update: Prisma.PickupStorageCaseUpdateInput = {
          revision: { increment: 1 },
          ...(['extend', 'waive'].includes(v.action)
            ? { termsRevision: { increment: 1 } }
            : {}),
        };
        if (v.action === 'extend') {
          const dates = pickupStorageExtensionDates(
            v.dueDate ?? '',
            pickupCalendarSchema.parse(row.calendar),
          );
          if (
            new Date(dates.dueAt) <= row.dueAt ||
            new Date(dates.dueAt) <= this.now()
          )
            throw new BadRequestException(
              'Choose a later future collection date.',
            );
          const reminders = pickupStorageReminderTimes(
            dates.dueAt,
            pickupCalendarSchema.parse(row.calendar),
          );
          update.dueAt = dates.dueAt;
          update.reviewAt = dates.reviewAt;
          update.carriedKobo = BigInt(this.charge(row).assessedKobo);
          update.reminderOneAt = reminders[0];
          update.reminderTwoAt = reminders[1];
          update.reminderOneSent = false;
          update.reminderTwoSent = false;
          update.reviewedAt = null;
        }
        if (v.action === 'waive') update.waived = true;
        if (v.action === 'assign') {
          if (v.assignedToId) {
            const user = await tx.user.findUnique({
              where: { id: v.assignedToId },
              include: { staffMembership: { include: { role: true } } },
            });
            const role = user?.staffMembership?.role;
            if (
              !user ||
              user.status !== 'active' ||
              user.archivedAt ||
              !staffPermissionsFor(
                user.role,
                role ? (role.archivedAt ? [] : role.permissions) : undefined,
              ).includes('pickup.manage')
            )
              throw new BadRequestException(
                'Choose active staff with pickup access.',
              );
          }
          update.assignee = v.assignedToId
            ? { connect: { id: v.assignedToId } }
            : { disconnect: true };
        }
        if (v.action === 'contact') update.reviewedAt = this.now();
        const changed = await tx.pickupStorageCase.update({
          where: { id: row.id },
          data: update,
        });
        await tx.pickupStorageAdjustment.create({
          data: {
            requestKey: v.idempotencyKey,
            caseId: row.id,
            actorId: who.user.id,
            action: v.action,
            reasonCiphertext: encryptPii(v.reason, 'audit'),
          },
        });
        if (['extend', 'waive'].includes(v.action))
          await this.notice(tx, changed, v.action);
        return {
          id: row.id,
          message:
            v.action === 'waive'
              ? 'Storage charges waived. Previously paid charges are not automatically refunded.'
              : 'Pickup case updated.',
        };
      },
      async (tx, id) => {
        const row = await tx.pickupStorageCase.findUnique({ where: { id } });
        return JSON.parse(
          JSON.stringify(row, (_key, value: unknown) =>
            typeof value === 'bigint' ? value.toString() : value,
          ),
        ) as unknown;
      },
    );
  }
  async collectionGate(tx: Tx, lineIds: string[]) {
    return confirmStorageCollection(tx, lineIds, this.now());
  }
  private async buyer(tx: Tx, who: AuthIdentity) {
    const user = await tx.user.findUnique({ where: { id: who.user.id } });
    const session = await tx.authSession.findFirst({
      where: {
        id: who.sessionId,
        userId: who.user.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        accessExpiresAt: { gt: new Date() },
      },
    });
    if (
      !user ||
      user.role !== 'buyer' ||
      user.status !== 'active' ||
      user.archivedAt ||
      !user.emailVerifiedAt ||
      !session
    )
      throw new ForbiddenException(
        'Sign in with your verified buyer account before paying.',
      );
    return user;
  }
  private paymentView(row: Prisma.PickupStoragePaymentGetPayload<object>) {
    return storagePaymentSchema.parse({
      id: row.id,
      caseId: row.caseId,
      method: row.method,
      status: row.status,
      storageKobo: money(row.storageKobo),
      feeKobo: money(row.feeKobo),
      amountKobo: money(row.amountKobo),
      expiresAt: row.expiresAt.toISOString(),
      checkoutUrl: row.checkoutCiphertext
        ? decryptPii(Buffer.from(row.checkoutCiphertext), 'checkout-url')
        : null,
      createdAt: row.createdAt.toISOString(),
    });
  }
  async quote(who: AuthIdentity, input: unknown) {
    const v = storagePaymentStartSchema.parse(input);
    const payment = await this.ledger.db.$transaction(async (tx) => {
      await this.buyer(tx, who);
      const row = await this.lock(tx, v.caseId);
      if (row.userId !== who.user.id || row.collectedAt)
        throw new ForbiddenException(
          'This storage case is not payable by this account.',
        );
      const previous = await tx.pickupStoragePayment.findUnique({
        where: {
          userId_requestKey: {
            userId: who.user.id,
            requestKey: v.idempotencyKey,
          },
        },
      });
      if (previous) {
        if (previous.caseId !== row.id || previous.method !== v.method)
          throw new ConflictException(
            'This request key already belongs to another checkout.',
          );
        return previous;
      }
      const pending = await tx.pickupStoragePayment.findFirst({
        where: {
          caseId: row.id,
          status: 'pending',
          expiresAt: { gt: this.now() },
        },
      });
      if (pending)
        throw new ConflictException(
          'A storage checkout is already pending. Continue or cancel it before starting another.',
        );
      const amount = this.charge(row).outstandingKobo;
      if (amount < 1)
        throw new ConflictException('This item has no unpaid storage charge.');
      if (v.method !== 'wallet' && !this.provider)
        throw new ServiceUnavailableException(
          'Direct checkout needs the configured Paystack test provider.',
        );
      const quote =
        v.method === 'wallet'
          ? { amountKobo: amount, feeKobo: 0 }
          : quotePurchasePayment(amount, v.method);
      const id = randomUUID();
      return tx.pickupStoragePayment.create({
        data: {
          id,
          caseId: row.id,
          userId: who.user.id,
          requestKey: v.idempotencyKey,
          caseRevision: row.termsRevision,
          method: v.method,
          storageKobo: BigInt(amount),
          feeKobo: BigInt(quote.feeKobo),
          amountKobo: BigInt(quote.amountKobo),
          providerRef: 'auction-storage-' + id,
          expiresAt: new Date(this.now().getTime() + 600000),
        },
      });
    });
    return this.paymentView(payment);
  }
  async pendingPayment(userId: string, caseId: string) {
    const row = await this.ledger.db.pickupStoragePayment.findFirst({
      where: { userId, caseId, status: { in: ['pending', 'review'] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return row ? this.payment(userId, row.id) : null;
  }
  async confirm(who: AuthIdentity, input: unknown) {
    const v = storagePaymentConfirmSchema.parse(input);
    const initial = await this.ledger.db.pickupStoragePayment.findFirst({
      where: { id: v.paymentId, userId: who.user.id },
    });
    if (!initial) throw new NotFoundException('Storage checkout not found.');
    const row = await this.ledger.db.$transaction(
      async (tx) => {
        await this.buyer(tx, who);
        const storage = await this.lock(tx, initial.caseId);
        const payment = await tx.pickupStoragePayment.findUniqueOrThrow({
          where: { id: initial.id },
        });
        if (payment.status === 'paid') return payment;
        if (
          payment.status !== 'pending' ||
          payment.expiresAt <= this.now() ||
          storage.collectedAt ||
          storage.termsRevision !== payment.caseRevision ||
          BigInt(this.charge(storage).outstandingKobo) !== payment.storageKobo
        )
          throw new ConflictException(
            'Storage terms changed or expired. Cancel this checkout and review a fresh amount.',
          );
        if (
          payment.confirmationKey &&
          payment.confirmationKey !== v.idempotencyKey
        )
          throw new ConflictException(
            'Continue this checkout using the original confirmation.',
          );
        if (payment.method !== 'wallet') {
          return tx.pickupStoragePayment.update({
            where: { id: payment.id },
            data: { confirmationKey: v.idempotencyKey },
          });
        }
        const wallet = await tx.wallet.findUnique({
          where: { userId: who.user.id },
        });
        if (!wallet)
          throw new ConflictException(
            'Your available wallet balance cannot cover this storage charge. Choose card or transfer.',
          );
        const receipt = await this.ledger.debitInTransaction(tx, {
          walletId: wallet.id,
          amountKobo: payment.storageKobo,
          idempotencyKey: 'storage:wallet:' + payment.id,
          reference: 'storage:wallet:' + payment.id,
        });
        await tx.pickupStorageCase.update({
          where: { id: storage.id },
          data: { paidKobo: { increment: payment.storageKobo } },
        });
        return tx.pickupStoragePayment.update({
          where: { id: payment.id },
          data: {
            confirmationKey: v.idempotencyKey,
            status: 'paid',
            settledAt: this.now(),
            ledgerTransactionId: receipt.id,
          },
        });
      },
      { timeout: 20000 },
    );
    if (row.method === 'wallet' || row.status !== 'pending')
      return this.paymentView(row);
    await this.initialize(row.id);
    return this.payment(who.user.id, row.id);
  }
  private async initialize(id: string) {
    if (!this.provider)
      throw new ServiceUnavailableException('Direct checkout is unavailable.');
    const claimed = await this.ledger.db.pickupStoragePayment.updateMany({
      where: {
        id,
        status: 'pending',
        initializationAt: null,
        checkoutCiphertext: null,
        confirmationKey: { not: null },
        expiresAt: { gt: this.now() },
      },
      data: { initializationAt: this.now() },
    });
    if (!claimed.count) return;
    const row = await this.ledger.db.pickupStoragePayment.findUniqueOrThrow({
      where: { id },
      include: { buyer: true },
    });
    const origin = new URL(paymentReturnUrl('purchase', row.id));
    origin.pathname = '/pickup-storage';
    origin.search = '';
    origin.searchParams.set('payment', row.id);
    const checkout = await this.provider.initializeCard({
      reference: row.providerRef,
      amountKobo: money(row.amountKobo),
      email: row.buyer.emailCiphertext
        ? decryptPii(Buffer.from(row.buyer.emailCiphertext), 'email')
        : (() => {
            throw new ConflictException(
              'A verified email is required for checkout.',
            );
          })(),
      channel: row.method === 'bank_transfer' ? 'bank_transfer' : 'card',
      callbackUrl: origin.href,
    });
    const target = new URL(checkout.authorizationUrl);
    if (
      target.protocol !== 'https:' ||
      target.hostname !== 'checkout.paystack.com'
    )
      throw new ConflictException(
        'Provider checkout address could not be verified.',
      );
    await this.ledger.db.pickupStoragePayment.updateMany({
      where: { id, status: 'pending', checkoutCiphertext: null },
      data: { checkoutCiphertext: encryptPii(target.href, 'checkout-url') },
    });
  }
  async payment(userId: string, id: string) {
    const row = await this.ledger.db.pickupStoragePayment.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException('Storage checkout not found.');
    if (row.status === 'pending' && row.expiresAt <= this.now()) {
      await this.ledger.db.pickupStoragePayment.updateMany({
        where: { id, status: 'pending' },
        data: { status: 'expired' },
      });
      return this.paymentView({ ...row, status: 'expired' });
    }
    return this.paymentView(row);
  }
  async cancel(userId: string, id: string) {
    const initial = await this.ledger.db.pickupStoragePayment.findFirst({
      where: { id, userId },
    });
    if (!initial) throw new NotFoundException();
    await this.ledger.db.$transaction(async (tx) => {
      await this.lock(tx, initial.caseId);
      await tx.pickupStoragePayment.updateMany({
        where: { id, userId, status: 'pending', verifiedAt: null },
        data: { status: 'cancelled' },
      });
    });
    return this.payment(userId, id);
  }
  async verify(userId: string, id: string) {
    const row = await this.ledger.db.pickupStoragePayment.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException();
    if (row.method !== 'wallet' && !row.verifiedAt && this.provider) {
      const transfer = await this.provider.verifyTransfer(row.providerRef);
      if (transfer.status === 'success')
        await this.handlePayment(transfer, row.providerRef);
    }
    return this.payment(userId, id);
  }
  async handlePayment(transfer: VerifiedTransfer, reference: string) {
    if (!reference.startsWith('auction-storage-')) return false;
    const initial = await this.ledger.db.pickupStoragePayment.findUnique({
      where: { providerRef: reference },
      include: { buyer: { select: { emailHash: true } } },
    });
    if (!initial)
      throw new ConflictException('Storage payment reference is unknown.');
    if (
      initial.method === 'wallet' ||
      transfer.reference !== reference ||
      transfer.domain !== 'test' ||
      transfer.currency !== 'NGN' ||
      transfer.status !== 'success' ||
      transfer.channel !==
        (initial.method === 'bank_transfer' ? 'bank_transfer' : 'card') ||
      !transfer.customerEmail ||
      hashPii(transfer.customerEmail.trim().toLowerCase(), 'email') !==
        initial.buyer.emailHash ||
      !Number.isSafeInteger(transfer.amountKobo) ||
      BigInt(transfer.amountKobo) !== initial.amountKobo ||
      transfer.feeKobo === null ||
      !Number.isSafeInteger(transfer.feeKobo) ||
      BigInt(transfer.feeKobo) !== initial.feeKobo ||
      (transfer.channel === 'card' &&
        (!transfer.cardCountry ||
          (transfer.cardCountry === 'NG') !==
            (initial.method === 'local_card')))
    )
      throw new BadRequestException(
        'Provider payment does not match this storage checkout.',
      );
    await this.ledger.db.$transaction(
      async (tx) => {
        const storage = await this.lock(tx, initial.caseId);
        const row = await tx.pickupStoragePayment.findUniqueOrThrow({
          where: { id: initial.id },
        });
        if (row.verifiedAt) return;
        const valid =
          row.status === 'pending' &&
          row.expiresAt > this.now() &&
          row.confirmationKey !== null &&
          !storage.collectedAt &&
          !storage.waived &&
          storage.termsRevision === row.caseRevision &&
          BigInt(this.charge(storage).outstandingKobo) === row.storageKobo;
        const journalId = await this.ledger.storageReceiptInTransaction(tx, {
          reference,
          idempotencyKey: 'storage:external:' + row.id,
          amountKobo: money(row.storageKobo),
          suspense: !valid,
        });
        if (valid)
          await tx.pickupStorageCase.update({
            where: { id: storage.id },
            data: { paidKobo: { increment: row.storageKobo } },
          });
        else
          await tx.pickupStorageException.upsert({
            where: { reference: 'payment:' + row.id },
            create: {
              caseId: storage.id,
              reference: 'payment:' + row.id,
              kind: 'unapplied_provider_payment',
            },
            update: {},
          });
        await tx.pickupStoragePayment.update({
          where: { id: row.id },
          data: {
            verifiedAt: this.now(),
            settledAt: valid ? this.now() : null,
            status: valid ? 'paid' : 'review',
            ledgerTransactionId: journalId,
          },
        });
      },
      { timeout: 20000 },
    );
    return true;
  }
  async maintain() {
    let reminded = 0,
      reviewed = 0,
      reconciled = 0;
    await this.ledger.db.$transaction(async (tx) => {
      const pending = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM pickup_storage_cases WHERE collected_at IS NULL AND ((NOT reminder_one_sent AND reminder_one_at<=${this.now()}) OR (NOT reminder_two_sent AND reminder_two_at<=${this.now()}) OR (review_at<${this.now()} AND reviewed_at IS NULL)) ORDER BY due_at,id LIMIT 50 FOR UPDATE SKIP LOCKED`;
      for (const { id } of pending) {
        let row = await tx.pickupStorageCase.findUniqueOrThrow({
          where: { id },
        });
        const today = new Date(this.now().getTime() + 3600000)
          .toISOString()
          .slice(0, 10);
        for (const stage of [1, 2] as const) {
          const at = stage === 1 ? row.reminderOneAt : row.reminderTwoAt,
            sent = stage === 1 ? row.reminderOneSent : row.reminderTwoSent;
          if (sent || at > this.now()) continue;
          // Missed reminder days are skipped, never both delivered on one later day.
          if (
            row.dueAt > this.now() &&
            new Date(at.getTime() + 3600000).toISOString().slice(0, 10) ===
              today
          ) {
            await this.notice(tx, row, 'reminder' + stage);
            reminded++;
          }
          row = await tx.pickupStorageCase.update({
            where: { id },
            data:
              stage === 1
                ? { reminderOneSent: true }
                : { reminderTwoSent: true },
          });
        }
        if (row.reviewAt < this.now() && !row.reviewedAt) {
          await tx.pickupStorageException.upsert({
            where: { reference: 'overdue-review:' + id + ':' + row.revision },
            create: {
              caseId: id,
              reference: 'overdue-review:' + id + ':' + row.revision,
              kind: 'buyer_contact_required',
            },
            update: {},
          });
          await tx.pickupStorageCase.update({
            where: { id },
            data: { reviewedAt: this.now() },
          });
          reviewed++;
        }
      }
    });
    const pendingPayments = await this.ledger.db.pickupStoragePayment.findMany({
      where: {
        method: { not: 'wallet' },
        verifiedAt: null,
        initializationAt: { not: null },
        status: { in: ['pending', 'expired', 'cancelled'] },
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: 5,
    });
    for (const payment of pendingPayments) {
      try {
        if (this.provider)
          await this.handlePayment(
            await this.provider.verifyTransfer(payment.providerRef),
            payment.providerRef,
          );
      } catch {
        /* Preserve unverified payments for a later verified webhook/reconciliation. */
      }
      await this.ledger.db.pickupStoragePayment.updateMany({
        where: { id: payment.id, verifiedAt: null },
        data: {
          updatedAt: this.now(),
          ...(payment.expiresAt <= this.now() && payment.status === 'pending'
            ? { status: 'expired' }
            : {}),
        },
      });
    }
    const scan = await this.ledger.db.pickupStorageScan.findUnique({
      where: { id: 1 },
    });
    const cases = await this.ledger.db.pickupStorageCase.findMany({
      where: scan?.afterId ? { id: { gt: scan.afterId } } : {},
      orderBy: { id: 'asc' },
      take: 50,
      include: {
        line: {
          include: {
            collection: true,
            invoice: { include: { fulfilment: true } },
          },
        },
        payments: {
          where: { status: 'paid' },
          select: {
            storageKobo: true,
            ledgerTransactionId: true,
            ledgerTransaction: { include: { entries: true } },
          },
        },
      },
    });
    for (const row of cases) {
      const paid = row.payments.reduce((sum, p) => sum + p.storageKobo, 0n);
      const actualCollected =
        !!row.line.collection ||
        (row.line.invoice.fulfilment?.collectedAt !== null &&
          row.line.invoice.fulfilment?.collectedAt !== undefined);
      const kind =
        paid !== row.paidKobo
          ? 'storage_receipts_do_not_reconcile'
          : row.payments.some(
                (p) =>
                  !p.ledgerTransaction ||
                  p.ledgerTransaction.entries
                    .filter((e) => e.side === 'credit')
                    .reduce((sum, e) => sum + e.amountKobo, 0n) !==
                    p.storageKobo,
              )
            ? 'storage_journal_does_not_reconcile'
            : actualCollected !== (row.collectedAt !== null)
              ? 'collection_records_disagree'
              : null;
      if (kind) {
        await this.ledger.db.pickupStorageException.upsert({
          where: { reference: kind + ':' + row.id },
          create: { caseId: row.id, reference: kind + ':' + row.id, kind },
          update: {},
        });
        reconciled++;
      }
    }
    const afterId = cases.length === 50 ? (cases.at(-1)?.id ?? null) : null;
    await this.ledger.db.pickupStorageScan.upsert({
      where: { id: 1 },
      create: { id: 1, afterId },
      update: { afterId },
    });
    return { reminded, reviewed, reconciled };
  }
  async exceptions(who: AuthIdentity, cursor?: string) {
    return this.ledger.db.$transaction(async (tx) => {
      await this.staff.actor(tx, who, 'pickup.manage');
      const rows = await tx.pickupStorageException.findMany({
        where: { ...(cursor ? { id: { gt: cursor } } : {}) },
        include: {
          storageCase: {
            include: {
              line: { select: { lot: { select: { lotNumber: true } } } },
            },
          },
        },
        orderBy: { id: 'asc' },
        take: 21,
      });
      return {
        items: rows.slice(0, 20).map((row) => ({
          id: row.id,
          caseId: row.caseId,
          reference: row.reference,
          kind: row.kind,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
          itemReference: row.storageCase.line.lot.lotNumber,
        })),
        nextCursor: rows.length > 20 ? (rows[19]?.id ?? null) : null,
      };
    });
  }
}
