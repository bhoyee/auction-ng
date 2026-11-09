import { BadRequestException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import {
  PICKUP_FREE_WORKING_DAYS,
  PICKUP_STORAGE_DAILY_KOBO,
  binBatchSchema,
  binHasRoom,
  binLabelsSchema,
  binListSchema,
  binPageSchema,
  binRange,
  binSaveSchema,
  binStatus,
  canDeleteBin,
  canDeleteLocation,
  fromLedgerKobo,
  locationBinRuleSchema,
  locationCloseSchema,
  locationDetailSchema,
  locationListSchema,
  locationSaveSchema,
  locationStaffSchema,
  lotSetupDeleteSchema,
  staffOptionsSchema,
  staffRoles,
  weekdays,
  type LocationStatus,
} from '@auction-ng/shared';
import { Prisma } from '../generated/prisma/client';
import type { AuthIdentity } from '../auth/auth-service';
import {
  LotSetupBase,
  blocked,
  assertFresh,
  fieldError,
  nextUpdatedAt,
  parseInput,
  type Tx,
} from './lot-setup-base';

// A lot is "here" until it has been collected (or archived).
const CURRENT_LOT = Prisma.sql`l.archived_at IS NULL AND NOT EXISTS (
  SELECT 1 FROM invoice_lines il JOIN fulfilments f ON f.invoice_id=il.invoice_id
  WHERE il.lot_id=l.id AND f.collected_at IS NOT NULL)`;

const days = [...weekdays, 'holiday'] as const;
const hhmm = (d: Date | null) => (d ? d.toISOString().slice(11, 16) : null);
const timeOf = (t: string | null) =>
  t ? new Date(`1970-01-01T${t}:00Z`) : null;

// Today's date in Lagos (WAT, UTC+1), as YYYY-MM-DD.
const lagosToday = () =>
  new Date(Date.now() + 3600000).toISOString().slice(0, 10);
const lagosDayStart = () => new Date(`${lagosToday()}T00:00:00+01:00`);

function statusOf(row: {
  status: string;
  opensOn: Date | null;
}): LocationStatus {
  if (row.status === 'closed') return 'closed';
  if (row.opensOn && row.opensOn.toISOString().slice(0, 10) > lagosToday())
    return 'opening';
  return 'open';
}

// Working-day calendar for pickup deadlines, used only when a location has
// no storage policy yet; an existing policy calendar is never overwritten.
function calendarFromHours(
  hours: { day: string; opens: string | null; closes: string | null }[],
) {
  const open = hours.filter((h) => h.day !== 'holiday' && h.opens && h.closes);
  const minutes = (t: string) =>
    Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  if (!open.length)
    return {
      weekdays: [1, 2, 3, 4, 5],
      closedDates: [],
      opensMinute: 540,
      closesMinute: 1020,
    };
  return {
    weekdays: open.map((h) => weekdays.indexOf(h.day as never) + 1),
    closedDates: [],
    opensMinute: Math.min(...open.map((h) => minutes(h.opens ?? '09:00'))),
    closesMinute: Math.max(...open.map((h) => minutes(h.closes ?? '17:00'))),
  };
}

const summaryText = (
  hours: { day: string; opens: string | null; closes: string | null }[],
) =>
  Object.fromEntries(
    hours.map((h) => [h.day, h.opens ? `${h.opens}–${h.closes}` : 'Closed']),
  );

const cursorSchema = z.object({ code: z.string(), id: z.uuid() }).strict();

export class LocationService extends LotSetupBase {
  private async stats(tx: Tx, ids: string[]) {
    if (!ids.length)
      return new Map<
        string,
        { lots: number; pickups: number; used: number; bins: number }
      >();
    const lots = await tx.$queryRaw<{ id: string; n: bigint }[]>`
      SELECT l.location_id::text AS id, count(*) AS n FROM lots l
      WHERE l.location_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) AND ${CURRENT_LOT}
      GROUP BY l.location_id`;
    const pickups = await tx.$queryRaw<{ id: string; n: bigint }[]>`
      SELECT location_id::text AS id, count(*) AS n FROM fulfilments
      WHERE location_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
        AND collected_at >= ${lagosDayStart()}
      GROUP BY location_id`;
    const bins = await tx.$queryRaw<
      { id: string; bins: bigint; used: bigint }[]
    >`
      SELECT b.location_id::text AS id, count(*) AS bins,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM lots l WHERE l.bin_id=b.id AND ${CURRENT_LOT})) AS used
      FROM bins b
      WHERE b.deleted_at IS NULL AND b.location_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
      GROUP BY b.location_id`;
    const map = new Map<
      string,
      { lots: number; pickups: number; used: number; bins: number }
    >();
    for (const id of ids)
      map.set(id, {
        lots: Number(lots.find((r) => r.id === id)?.n ?? 0),
        pickups: Number(pickups.find((r) => r.id === id)?.n ?? 0),
        used: Number(bins.find((r) => r.id === id)?.used ?? 0),
        bins: Number(bins.find((r) => r.id === id)?.bins ?? 0),
      });
    return map;
  }

  async list(who: AuthIdentity) {
    return this.db.$transaction(async (tx) => {
      const { canManage } = await this.reader(tx, who);
      const rows = await tx.location.findMany({
        where: { archivedAt: null },
        orderBy: [{ status: 'desc' }, { name: 'asc' }],
        take: 50,
      });
      const stats = await this.stats(
        tx,
        rows.map((r) => r.id),
      );
      return locationListSchema.parse({
        canManage,
        items: rows.map((r) => {
          const s = stats.get(r.id);
          return {
            id: r.id,
            name: r.name,
            code: r.code,
            address: r.address,
            status: statusOf(r),
            opensOn: r.opensOn?.toISOString().slice(0, 10) ?? null,
            lotsHere: s?.lots ?? 0,
            pickupsToday: s?.pickups ?? 0,
            binsUsedPercent: s?.bins ? Math.round((s.used / s.bins) * 100) : 0,
          };
        }),
      });
    });
  }

  private async binCounts(tx: Tx, locationId: string) {
    return tx.$queryRaw<
      {
        id: string;
        code: string;
        note: string | null;
        capacity: number | null;
        accepts: boolean;
        updated: Date;
        lots: bigint;
      }[]
    >`SELECT b.id::text AS id, b.code, b.note, b.capacity, b.accepts_new_lots AS accepts,
        b.updated_at AS updated,
        (SELECT count(*) FROM lots l WHERE l.bin_id=b.id AND ${CURRENT_LOT}) AS lots
      FROM bins b WHERE b.location_id=${locationId}::uuid AND b.deleted_at IS NULL
      ORDER BY b.code, b.id`;
  }

  async detail(who: AuthIdentity, id: string) {
    return this.db.$transaction(async (tx) => {
      const { canManage } = await this.reader(tx, who);
      const row = await tx.location.findUnique({
        where: { id },
        include: {
          openingHours: true,
          storageCentre: true,
          staff: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  role: true,
                  staffMembership: {
                    select: { role: { select: { name: true } } },
                  },
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      if (!row || row.archivedAt) throw new NotFoundException();
      const usedOnLots = await tx.lot.count({ where: { locationId: id } });
      const bins = await this.binCounts(tx, id);
      const hours = days.map((day) => {
        const h = row.openingHours.find((o) => o.day === day);
        return {
          day,
          opens: hhmm(h?.opens ?? null),
          closes: hhmm(h?.closes ?? null),
        };
      });
      return locationDetailSchema.parse({
        id: row.id,
        name: row.name,
        code: row.code,
        address: row.address,
        landmark: row.landmark,
        phone: row.phone,
        lat: row.lat === null ? null : Number(row.lat),
        lng: row.lng === null ? null : Number(row.lng),
        status: statusOf(row),
        opensOn: row.opensOn?.toISOString().slice(0, 10) ?? null,
        freeWorkingDays: PICKUP_FREE_WORKING_DAYS,
        storageFeeKoboPerDay: fromLedgerKobo(
          row.storageCentre?.dailyKobo ?? BigInt(PICKUP_STORAGE_DAILY_KOBO),
        ),
        slotMinutes: row.slotMinutes,
        slotCapacity: row.capacityPerSlot,
        idRequired: row.idRequired,
        deliveryEnabled: row.deliveryEnabled,
        binRequiredToPublish: row.binRequiredToPublish,
        hours,
        usedOnLots,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        bins: {
          total: bins.length,
          inUse: bins.filter((b) => b.lots > 0n).length,
          lotsStored: bins.reduce((sum, b) => sum + Number(b.lots), 0),
          preview: bins
            .slice(0, 6)
            .map((b) => ({ code: b.code, lots: Number(b.lots) })),
        },
        staff: row.staff.map((s) => ({
          id: s.user.id,
          name: s.user.name,
          roleName: s.user.staffMembership?.role.name ?? s.user.role,
        })),
        deleteCheck: canDeleteLocation({ everHeldLots: usedOnLots > 0 }),
        canManage,
      });
    });
  }

  async staffOptions(who: AuthIdentity, search?: string) {
    return this.db.$transaction(async (tx) => {
      await this.reader(tx, who);
      const rows = await tx.user.findMany({
        where: {
          role: { in: staffRoles.filter((r) => r !== 'admin') },
          status: 'active',
          archivedAt: null,
          ...(search
            ? { name: { contains: search, mode: 'insensitive' } }
            : {}),
        },
        select: {
          id: true,
          name: true,
          role: true,
          staffMembership: { select: { role: { select: { name: true } } } },
        },
        orderBy: { name: 'asc' },
        take: 50,
      });
      return staffOptionsSchema.parse({
        items: rows.map((r) => ({
          id: r.id,
          name: r.name,
          roleName: r.staffMembership?.role.name ?? r.role,
        })),
      });
    });
  }

  private async snapshot(tx: Tx, id: string) {
    const row = await tx.location.findUnique({
      where: { id },
      include: { openingHours: true, storageCentre: true },
    });
    return row
      ? {
          ...row,
          storageFeeKoboPerDay: row.storageCentre?.dailyKobo ?? null,
          storageCentre: undefined,
        }
      : null;
  }

  async save(who: AuthIdentity, input: unknown) {
    const v = parseInput(locationSaveSchema, input);
    const seen = new Set(v.hours.map((h) => h.day));
    if (seen.size !== days.length)
      throw fieldError(
        'hours',
        'Set opening hours for every day and public holidays.',
        400,
      );
    return this.change(
      who,
      v,
      'location',
      v.id ? 'updated' : 'created',
      async (tx) => {
        let before: Awaited<ReturnType<LocationService['snapshot']>> = null;
        if (v.id) {
          await tx.$queryRaw`SELECT id FROM locations WHERE id=${v.id}::uuid FOR UPDATE`;
          before = await this.snapshot(tx, v.id);
          if (!before || before.archivedAt) throw new NotFoundException();
          assertFresh(before.updatedAt, v.expectedUpdatedAt, 'location');
        }
        const data = {
          name: v.name,
          code: v.code,
          address: v.address,
          landmark: v.landmark,
          phone: v.phone,
          lat: v.lat,
          lng: v.lng,
          opensOn: v.opensOn ? new Date(`${v.opensOn}T00:00:00Z`) : null,
          slotMinutes: v.slotMinutes,
          capacityPerSlot: v.slotCapacity,
          idRequired: v.idRequired,
          deliveryEnabled: v.deliveryEnabled,
          binRequiredToPublish: v.binRequiredToPublish,
          hours: summaryText(v.hours),
          updatedAt: nextUpdatedAt(before?.updatedAt),
        };
        const row = v.id
          ? await tx.location.update({ where: { id: v.id }, data })
          : await tx.location.create({ data });
        await tx.locationOpeningHours.deleteMany({
          where: { locationId: row.id },
        });
        await tx.locationOpeningHours.createMany({
          data: v.hours.map((h) => ({
            locationId: row.id,
            day: h.day,
            opens: timeOf(h.opens),
            closes: timeOf(h.closes),
          })),
        });
        // Only the fee per day is set here; the 5 free working days and the
        // cap stay the same everywhere. Items already marked ready keep the fee
        // they were given.
        const centre = await tx.pickupStorageCentre.findUnique({
          where: { locationId: row.id },
        });
        if (!centre)
          await tx.pickupStorageCentre.create({
            data: {
              locationId: row.id,
              dailyKobo: BigInt(v.storageFeeKoboPerDay),
              calendar: calendarFromHours(v.hours),
            },
          });
        else if (centre.dailyKobo !== BigInt(v.storageFeeKoboPerDay))
          await tx.pickupStorageCentre.update({
            where: { locationId: row.id },
            data: {
              dailyKobo: BigInt(v.storageFeeKoboPerDay),
              revision: { increment: 1 },
            },
          });
        return {
          result: { id: row.id, message: `${row.name} saved.` },
          before,
          after: await this.snapshot(tx, row.id),
        };
      },
    );
  }

  async close(who: AuthIdentity, input: unknown) {
    const v = parseInput(locationCloseSchema, input);
    return this.change(
      who,
      v,
      'location',
      v.closed ? 'closed' : 'reopened',
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM locations WHERE id=${v.id}::uuid FOR UPDATE`;
        const before = await tx.location.findUnique({ where: { id: v.id } });
        if (!before || before.archivedAt) throw new NotFoundException();
        assertFresh(before.updatedAt, v.expectedUpdatedAt, 'location');
        const after = await tx.location.update({
          where: { id: v.id },
          data: {
            status: v.closed ? 'closed' : 'open',
            updatedAt: nextUpdatedAt(before.updatedAt),
          },
        });
        return {
          result: {
            id: v.id,
            message: v.closed
              ? `${after.name} is closed. It no longer appears for new lots or pickups; existing lots stay.`
              : `${after.name} is open again.`,
          },
          before,
          after,
        };
      },
    );
  }

  async binRule(who: AuthIdentity, input: unknown) {
    const v = parseInput(locationBinRuleSchema, input);
    return this.change(who, v, 'location', 'bin_rule_changed', async (tx) => {
      await tx.$queryRaw`SELECT id FROM locations WHERE id=${v.id}::uuid FOR UPDATE`;
      const before = await tx.location.findUnique({ where: { id: v.id } });
      if (!before || before.archivedAt) throw new NotFoundException();
      assertFresh(before.updatedAt, v.expectedUpdatedAt, 'location');
      const after = await tx.location.update({
        where: { id: v.id },
        data: {
          binRequiredToPublish: v.binRequiredToPublish,
          updatedAt: nextUpdatedAt(before.updatedAt),
        },
      });
      return {
        result: {
          id: v.id,
          message: v.binRequiredToPublish
            ? 'Lots here now need a bin before they can be published.'
            : 'Staff can add the bin later. Lots with no bin show a red "no bin".',
        },
        before: { binRequiredToPublish: before.binRequiredToPublish },
        after: { binRequiredToPublish: after.binRequiredToPublish },
      };
    });
  }

  async assignStaff(who: AuthIdentity, input: unknown) {
    const v = parseInput(locationStaffSchema, input);
    return this.change(who, v, 'location', 'staff_assigned', async (tx) => {
      await tx.$queryRaw`SELECT id FROM locations WHERE id=${v.id}::uuid FOR UPDATE`;
      const location = await tx.location.findUnique({ where: { id: v.id } });
      if (!location || location.archivedAt) throw new NotFoundException();
      const staff = await tx.user.findMany({
        where: {
          id: { in: v.staffIds },
          role: { in: [...staffRoles] },
          status: 'active',
          archivedAt: null,
        },
        select: { id: true },
      });
      if (staff.length !== new Set(v.staffIds).size)
        throw fieldError('staffIds', 'Pick active staff members only.', 400);
      const before = await tx.locationStaff.findMany({
        where: { locationId: v.id },
        select: { userId: true },
      });
      await tx.locationStaff.deleteMany({ where: { locationId: v.id } });
      await tx.locationStaff.createMany({
        data: staff.map((s) => ({ locationId: v.id, userId: s.id })),
      });
      return {
        result: { id: v.id, message: 'Staff for this location saved.' },
        before: before.map((b) => b.userId),
        after: staff.map((s) => s.id),
      };
    });
  }

  async remove(who: AuthIdentity, input: unknown) {
    const v = parseInput(lotSetupDeleteSchema, input);
    return this.change(who, v, 'location', 'deleted', async (tx) => {
      await tx.$queryRaw`SELECT id FROM locations WHERE id=${v.id}::uuid FOR UPDATE`;
      const before = await this.snapshot(tx, v.id);
      if (!before) throw new NotFoundException();
      assertFresh(before.updatedAt, v.expectedUpdatedAt, 'location');
      const check = canDeleteLocation({
        everHeldLots: (await tx.lot.count({ where: { locationId: v.id } })) > 0,
      });
      if (!check.allowed) throw blocked(check.reason);
      try {
        await tx.bin.deleteMany({ where: { locationId: v.id } });
        await tx.pickupStorageCentre.deleteMany({
          where: { locationId: v.id },
        });
        await tx.location.delete({ where: { id: v.id } });
      } catch {
        throw blocked(
          'This location has pickup history. Close it instead; its records stay.',
        );
      }
      return {
        result: { id: v.id, message: `${before.name} deleted.` },
        before,
        after: null,
      };
    });
  }

  // ---- Bins ---------------------------------------------------------------

  async bins(who: AuthIdentity, locationId: string, input: unknown) {
    const q = parseInput(binListSchema, input);
    return this.db.$transaction(async (tx) => {
      const { canManage } = await this.reader(tx, who);
      const location = await tx.location.findUnique({
        where: { id: locationId },
      });
      if (!location || location.archivedAt) throw new NotFoundException();
      const all = await this.binCounts(tx, locationId);
      const rows = all.map((b) => {
        const lots = Number(b.lots);
        return {
          id: b.id,
          code: b.code,
          note: b.note,
          capacity: b.capacity,
          acceptsNewLots: b.accepts,
          lots,
          status: binStatus({ acceptsNewLots: b.accepts, lots }),
          updatedAt: b.updated.toISOString(),
          deleteCheck: canDeleteBin({ lots }),
        };
      });
      const [counts] = await tx.$queryRaw<{ here: bigint; no_bin: bigint }[]>`
        SELECT count(*) AS here, count(*) FILTER (WHERE l.bin_id IS NULL) AS no_bin
        FROM lots l WHERE l.location_id=${locationId}::uuid AND ${CURRENT_LOT}`;
      let after: z.infer<typeof cursorSchema> | undefined;
      if (q.cursor)
        try {
          after = cursorSchema.parse(
            JSON.parse(Buffer.from(q.cursor, 'base64url').toString()),
          );
        } catch {
          throw new BadRequestException('Reload the bins list.');
        }
      const term = q.search?.toLowerCase();
      const filtered = rows
        .filter((r) => q.status === 'all' || r.status === q.status)
        .filter(
          (r) =>
            !term ||
            r.code.toLowerCase().includes(term) ||
            (r.note ?? '').toLowerCase().includes(term),
        )
        .filter(
          (r) =>
            !after ||
            r.code > after.code ||
            (r.code === after.code && r.id > after.id),
        );
      const page = filtered.slice(0, q.limit);
      const last = page.at(-1);
      return binPageSchema.parse({
        location: {
          id: location.id,
          name: location.name,
          code: location.code,
          binRequiredToPublish: location.binRequiredToPublish,
          updatedAt: location.updatedAt.toISOString(),
        },
        summary: {
          bins: rows.length,
          openForNewLots: rows.filter((r) => r.acceptsNewLots).length,
          lotsInBins: rows.reduce((sum, r) => sum + r.lots, 0),
          lotsAtLocation: Number(counts?.here ?? 0),
          lotsWithoutBin: Number(counts?.no_bin ?? 0),
        },
        counts: {
          all: rows.length,
          in_use: rows.filter((r) => r.status === 'in_use').length,
          empty: rows.filter((r) => r.status === 'empty').length,
          closed: rows.filter((r) => r.status === 'closed').length,
        },
        existingCodes: rows.map((r) => r.code),
        items: page,
        nextCursor:
          filtered.length > q.limit && last
            ? Buffer.from(
                JSON.stringify({ code: last.code, id: last.id }),
              ).toString('base64url')
            : null,
        canManage,
      });
    });
  }

  private async binSnapshot(tx: Tx, id: string) {
    return tx.bin.findUnique({ where: { id } });
  }

  async saveBin(who: AuthIdentity, input: unknown) {
    const v = parseInput(binSaveSchema, input);
    return this.change(
      who,
      v,
      'bin',
      v.id ? 'updated' : 'created',
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM locations WHERE id=${v.locationId}::uuid FOR UPDATE`;
        const location = await tx.location.findUnique({
          where: { id: v.locationId },
        });
        if (!location || location.archivedAt) throw new NotFoundException();
        let before: Awaited<ReturnType<LocationService['binSnapshot']>> = null;
        if (v.id) {
          before = await this.binSnapshot(tx, v.id);
          if (!before || before.deletedAt || before.locationId !== v.locationId)
            throw new NotFoundException();
          assertFresh(before.updatedAt, v.expectedUpdatedAt, 'bin');
          const lots = await tx.lot.count({
            where: { binId: v.id, archivedAt: null },
          });
          if (v.capacity !== null && !binHasRoom(v.capacity, lots, 0))
            throw fieldError(
              'capacity',
              `This bin already holds ${lots} lots. Set a limit of at least ${lots}, or leave it empty.`,
              400,
            );
        }
        const clash = await tx.bin.findFirst({
          where: {
            locationId: v.locationId,
            code: v.code,
            deletedAt: null,
            ...(v.id ? { id: { not: v.id } } : {}),
          },
        });
        if (clash)
          throw fieldError(
            'code',
            `${v.code} already exists at ${location.name}.`,
          );
        const data = {
          code: v.code,
          note: v.note,
          capacity: v.capacity,
          acceptsNewLots: v.acceptsNewLots,
          updatedAt: nextUpdatedAt(before?.updatedAt),
        };
        const row = v.id
          ? await tx.bin.update({ where: { id: v.id }, data })
          : await tx.bin.create({
              data: { ...data, locationId: v.locationId },
            });
        return {
          result: { id: row.id, message: `Bin ${row.code} saved.` },
          before,
          after: row,
        };
      },
    );
  }

  async addBins(who: AuthIdentity, input: unknown) {
    const v = parseInput(binBatchSchema, input);
    return this.change(who, v, 'bin', 'batch_created', async (tx) => {
      await tx.$queryRaw`SELECT id FROM locations WHERE id=${v.locationId}::uuid FOR UPDATE`;
      const location = await tx.location.findUnique({
        where: { id: v.locationId },
      });
      if (!location || location.archivedAt) throw new NotFoundException();
      const existing = await tx.bin.findMany({
        where: { locationId: v.locationId, deletedAt: null },
        select: { code: true },
      });
      const range = binRange(
        v.prefix,
        v.from,
        v.to,
        existing.map((b) => b.code),
      );
      if (!range.ok) throw fieldError('prefix', range.error, 400);
      const at = new Date();
      await tx.bin.createMany({
        data: range.codes.map((code) => ({
          locationId: v.locationId,
          code,
          note: v.note,
          capacity: v.capacity,
          updatedAt: at,
        })),
      });
      const created = await tx.bin.findMany({
        where: {
          locationId: v.locationId,
          code: { in: range.codes },
          deletedAt: null,
        },
        orderBy: { code: 'asc' },
        select: { id: true, code: true },
      });
      const first = created[0];
      if (!first) throw blocked('No bins were added.');
      return {
        result: {
          id: first.id,
          message: `Added ${created.length} bins: ${range.codes[0]} to ${range.codes.at(-1)}.`,
        },
        before: null,
        after: created,
      };
    });
  }

  async removeBin(who: AuthIdentity, input: unknown) {
    const v = parseInput(lotSetupDeleteSchema, input);
    return this.change(who, v, 'bin', 'deleted', async (tx) => {
      await tx.$queryRaw`SELECT id FROM bins WHERE id=${v.id}::uuid FOR UPDATE`;
      const before = await this.binSnapshot(tx, v.id);
      if (!before || before.deletedAt) throw new NotFoundException();
      assertFresh(before.updatedAt, v.expectedUpdatedAt, 'bin');
      const [row] = await tx.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM lots l WHERE l.bin_id=${v.id}::uuid AND ${CURRENT_LOT}`;
      const check = canDeleteBin({ lots: Number(row?.n ?? 0) });
      if (!check.allowed) throw blocked(check.reason);
      // Soft delete: lots collected from this bin keep their history.
      const after = await tx.bin.update({
        where: { id: v.id },
        data: {
          deletedAt: new Date(),
          updatedAt: nextUpdatedAt(before.updatedAt),
        },
      });
      return {
        result: { id: v.id, message: `Bin ${before.code} deleted.` },
        before,
        after,
      };
    });
  }

  async labels(who: AuthIdentity, locationId: string, ids?: string[]) {
    return this.db.$transaction(async (tx) => {
      await this.reader(tx, who, true);
      const location = await tx.location.findUnique({
        where: { id: locationId },
      });
      if (!location || location.archivedAt) throw new NotFoundException();
      const bins = await tx.bin.findMany({
        where: {
          locationId,
          deletedAt: null,
          ...(ids?.length ? { id: { in: ids } } : {}),
        },
        orderBy: { code: 'asc' },
        take: 200,
      });
      return binLabelsSchema.parse({
        items: bins.map((b) => ({
          id: b.id,
          code: b.code,
          note: b.note,
          locationCode: location.code,
          locationName: location.name,
          qr: `LVBIN:${location.code}:${b.code}:${b.id}`,
        })),
      });
    });
  }
}
