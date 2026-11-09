import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { LiveMonitorService } from '../apps/api/src/staff-admin/live-monitor-service';
import { monitorBook } from '../apps/api/src/staff-admin/live-book';
import type { StaffAdminService } from '../apps/api/src/staff-admin/staff-admin-service';
import type { BidService } from '../apps/api/src/bids/bid-service';
import type { AuthIdentity } from '../apps/api/src/auth/auth-service';
import {
  monitorLotsSchema,
  monitorSummarySchema,
} from '../packages/shared/src';

const now = Date.parse('2026-11-07T14:00:00Z'),
  categoryId = randomUUID(),
  locationId = randomUUID();
const namespace = `test:monitor:snapshot:${randomUUID()}:`;
const actor = vi.fn(async () => ({}));
const transaction = { $queryRaw: vi.fn(async () => [{ locked: true }]) };
const rows = Array.from({ length: 64 }, (_, i) => ({
  id: randomUUID(),
  lotNumber: 'LOT' + i,
  title: 'Phone ' + i,
  categoryId,
  locationId,
  category: { name: 'Phones' },
  location: { name: 'Lekki' },
  startPriceKobo: 50000n,
  originalRunTimeMs: null,
  endAt: new Date(
    now +
      (i === 0
        ? 16 * 60000
        : i === 1
          ? 29 * 60000
          : i === 2
            ? 31 * 60000
            : 60000 + i * 1000),
  ),
  images: [],
  _count: { watchlist: i },
}));
const staff = {
  actor,
  ledger: {
    db: {
      lot: { findMany: vi.fn(async () => rows) },
      user: { findMany: vi.fn(async () => []) },
      $queryRaw: vi.fn(async () => []),
      auctionPauseCommand: { findFirst: vi.fn(async () => null) },
      lotControlCommand: { findFirst: vi.fn(async () => null) },
      $transaction: async (work: (tx: unknown) => unknown) => work(transaction),
    },
  },
} as unknown as StaffAdminService;
const engine = {
  prefix: namespace,
  auctionPauseState: async () => ({ phase: 'live' }),
  monitorBooks: async (ids: string[]) => ({
    serverTime: new Date(now).toISOString(),
    states: ids.map((id) => ({
      open: true,
      startPriceKobo: 50000,
      currentPriceKobo: null,
      leader: null,
      endsAt: rows.find((row) => row.id === id)?.endAt.getTime() ?? now + 60000,
      streamId: '0-0',
    })),
  }),
} as unknown as BidService;
const monitor = new LiveMonitorService(
  staff,
  engine,
  process.env.REDIS_URL ?? 'redis://localhost:6379',
);
const who = {} as AuthIdentity;
beforeAll(async () => {
  await monitor.refresh();
});
afterAll(async () => {
  await monitor.onModuleDestroy();
});

it('reads a complete Redis generation and enforces 50-row cursor pages', async () => {
  const first = monitorLotsSchema.parse(
    await monitor.read(who, 'lots', { limit: 50 }),
  );
  expect(first.items).toHaveLength(50);
  expect(first.nextCursor).toBeTruthy();
  const next = monitorLotsSchema.parse(
    await monitor.read(who, 'lots', { limit: 50, cursor: first.nextCursor }),
  );
  expect(next.items).toHaveLength(14);
  expect(
    new Set([...first.items, ...next.items].map((row) => row.id)).size,
  ).toBe(64);
  expect(next.nextCursor).toBeNull();
  expect(actor).toHaveBeenCalledWith(transaction, who, 'auctions.manage');
});
it('uses actual counts and explicitly marks unavailable online presence and original run time', async () => {
  const summary = monitorSummarySchema.parse(
    await monitor.read(who, 'summary', {}),
  );
  expect(summary.liveCount).toBe(64);
  expect(summary.closing15Count).toBe(61);
  expect(summary.closing30Count).toBe(63);
  expect(summary.onlineBuyers).toBeNull();
  const list = monitorLotsSchema.parse(await monitor.read(who, 'lots', {}));
  expect(list.items[0]?.runTimeMs).toBeNull();
  expect(list.items[0]?.currentPriceKobo).toBe(50000);
});
it('checks current staff authorization before returning cached protected records', async () => {
  actor.mockRejectedValueOnce(new Error('Denied'));
  await expect(monitor.read(who, 'summary', {})).rejects.toThrow('Denied');
});
it('rejects malformed cursors instead of restarting from the first page', async () => {
  await expect(
    monitor.read(who, 'lots', { cursor: 'invalid' }),
  ).rejects.toThrow('Invalid auction page');
});
it('strips all private book fields at the projection boundary', () => {
  const value = monitorBook(
    JSON.stringify({
      open: true,
      startPriceKobo: 50000,
      currentPriceKobo: 60000,
      endsAt: now + 60000,
      leader: { bidderId: randomUUID(), maxKobo: 999999999 },
      groupId: randomUUID(),
      heldKobo: 123456789,
      feeVersion: 'v1',
    }),
  );
  expect(value).not.toHaveProperty('groupId');
  expect(value?.leader).not.toHaveProperty('maxKobo');
  expect(value).not.toHaveProperty('heldKobo');
});
