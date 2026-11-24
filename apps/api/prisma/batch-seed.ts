import { createHash, randomUUID } from 'node:crypto';
import { encryptPii, hashPii } from '../src/security/pii';
import {
  queueBatch,
  recalculateQueued,
  supplierPhonePurpose,
} from '../src/batches/batch-recalc';
import { watToday } from '../src/batches/batch-recalc';
import type { LedgerService } from '../src/ledger/ledger-service';

type Db = LedgerService['db'];
const M = 100_000_000; // ₦1M in kobo
const NAMESPACE = 'demo:batches:';

// The six suppliers in docs/design/admin-suppliers.png.
const suppliers = [
  [
    'Konga returns',
    'marketplace_returns',
    'Adaeze Nwosu',
    '+2348035550198',
    'returns@konga.example',
    'Ilupeju, Lagos',
    'GTBank',
    '0123456789',
    'Boxes are often dented; items mostly work. Ask for the item list before paying.',
    true,
  ],
  [
    'Jumia seller returns',
    'marketplace_returns',
    'Femi Ojo',
    '+2348035550142',
    'returns@jumia.example',
    'Ikeja, Lagos',
    'Access Bank',
    '0123456790',
    null,
    true,
  ],
  [
    'UK Return Pallets Ltd',
    'overseas_pallets',
    'James Carter',
    null,
    'sales@ukpallets.example',
    null,
    null,
    null,
    'Landed cost is paid in Naira.',
    true,
  ],
  [
    'Slot Systems (Ikeja)',
    'retailer',
    'Bayo Lawal',
    '+2348035550177',
    null,
    'Computer Village, Ikeja',
    'Zenith Bank',
    '0123456791',
    null,
    true,
  ],
  [
    'Walk-in sellers',
    'individual',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    true,
  ],
  [
    'HomeMart clearance',
    'retailer',
    'Ngozi Eze',
    '+2348035550133',
    null,
    'Surulere, Lagos',
    'UBA',
    '0123456792',
    'Paused: stock did not earn its cost back.',
    false,
  ],
] as const;

type Plan = {
  code: string;
  supplier: string;
  name: string;
  /** Days ago; negative is the expected day. */
  received: number;
  cost: number;
  items: number;
  intaken: number;
  sold: number;
  back: number;
  status: 'arriving' | 'selling' | 'closed';
  stuck?: number;
};
// The batches in docs/design/admin-batches.png and admin-suppliers.png.
const plans: Plan[] = [
  {
    code: 'B-0271',
    supplier: 'Walk-in sellers',
    name: 'Furniture overstock, Ikeja',
    received: 92,
    cost: 3.5,
    items: 74,
    intaken: 74,
    sold: 49,
    back: 3.62,
    status: 'selling',
  },
  {
    code: 'B-0294',
    supplier: 'HomeMart clearance',
    name: 'Insurance salvage, Lagos',
    received: 55,
    cost: 2.2,
    items: 48,
    intaken: 48,
    sold: 39,
    back: 2.05,
    status: 'selling',
  },
  {
    code: 'B-0296',
    supplier: 'Konga returns',
    name: 'Konga returns, October',
    received: 46,
    cost: 2.6,
    items: 180,
    intaken: 180,
    sold: 180,
    back: 3.71,
    status: 'closed',
  },
  {
    code: 'B-0299',
    supplier: 'UK Return Pallets Ltd',
    name: 'Electronics importer, Alaba',
    received: 48,
    cost: 9.4,
    items: 160,
    intaken: 160,
    sold: 154,
    back: 13.1,
    status: 'closed',
  },
  {
    code: 'B-0305',
    supplier: 'Slot Systems (Ikeja)',
    name: 'Shelf pulls',
    received: 41,
    cost: 1.9,
    items: 196,
    intaken: 196,
    sold: 180,
    back: 2.88,
    status: 'selling',
  },
  {
    code: 'B-0312',
    supplier: 'UK Return Pallets Ltd',
    name: 'UK return pallets (6)',
    received: 34,
    cost: 7.8,
    items: 540,
    intaken: 540,
    sold: 383,
    back: 8.31,
    status: 'selling',
  },
  {
    code: 'B-0318',
    supplier: 'Konga returns',
    name: 'Konga returns',
    received: 27,
    cost: 3.2,
    items: 212,
    intaken: 212,
    sold: 166,
    back: 4.92,
    status: 'selling',
    stuck: 9,
  },
  {
    code: 'B-0331',
    supplier: 'Jumia seller returns',
    name: 'Jumia seller returns',
    received: 20,
    cost: 4.6,
    items: 288,
    intaken: 184,
    sold: 0,
    back: 0,
    status: 'selling',
  },
  {
    code: 'B-0340',
    supplier: 'UK Return Pallets Ltd',
    name: 'US return pallets (10)',
    received: -5,
    cost: 12.5,
    items: 900,
    intaken: 0,
    sold: 0,
    back: 0,
    status: 'arriving',
  },
  {
    code: 'B-0344',
    supplier: 'Konga returns',
    name: 'Konga returns, November',
    received: -3,
    cost: 3.1,
    items: 200,
    intaken: 0,
    sold: 0,
    back: 0,
    status: 'arriving',
  },
];

const uuid = (seed: string) => {
  const h = createHash('sha256')
    .update('batch-seed:' + seed)
    .digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const dayAgo = (days: number) =>
  new Date(Date.parse(watToday() + 'T00:00:00Z') - days * 86_400_000);

/**
 * Demo suppliers, batches, lots and paid invoices, for local databases only.
 * Triggers are off while rows are added, so no demo sale notifies anyone.
 * Safe to run again: batches that exist are skipped.
 */
export async function seedBatches(db: Db) {
  const existing = new Set(
    (
      await db.batch.findMany({
        where: { code: { in: plans.map((p) => p.code) } },
        select: { code: true },
      })
    ).map((b) => b.code),
  );
  const location = await db.location.findFirst({
    where: { archivedAt: null },
    orderBy: { code: 'asc' },
  });
  const categories = await db.category.findMany({
    where: { archivedAt: null, parentId: null },
    orderBy: { sortOrder: 'asc' },
    take: 5,
  });
  const policy = await db.auctionFeePolicy.findFirst();
  if (!location || !categories.length || !policy)
    throw new Error(
      'Seed Lot setup first (pnpm --filter api db:seed:lot-setup).',
    );
  const ids = new Map<string, string>();
  for (const s of suppliers) {
    const [
      name,
      type,
      contactName,
      phone,
      email,
      address,
      bankName,
      accountNumber,
      notes,
      active,
    ] = s;
    const found = await db.supplier.findFirst({ where: { name } });
    ids.set(
      name,
      found?.id ??
        (
          await db.supplier.create({
            data: {
              name,
              type,
              contactName,
              phoneCiphertext: phone
                ? encryptPii(phone, supplierPhonePurpose)
                : null,
              email,
              addressCiphertext: address
                ? encryptPii(address, 'supplier-address')
                : null,
              bankCiphertext: bankName
                ? encryptPii(
                    JSON.stringify({ bankName, accountNumber }),
                    'supplier-bank',
                  )
                : null,
              paymentTerms: 'Full payment when bought',
              usualCategoryIds: categories.slice(0, 3).map((c) => c.id),
              notes,
              active,
              createdAt: dayAgo(110),
            },
          })
        ).id,
    );
  }
  const email = 'batch-demo-buyer@example.test';
  const buyer =
    (await db.user.findFirst({
      where: { emailHash: hashPii(email, 'email') },
    })) ??
    (await db.user.create({
      data: {
        name: 'Demo batch buyer',
        role: 'buyer',
        emailHash: hashPii(email, 'email'),
        emailCiphertext: encryptPii(email, 'email'),
      },
    }));
  await db.$executeRaw`INSERT INTO bid_engine_runtime(namespace, redis_run_id) VALUES (${NAMESPACE}, 'demo') ON CONFLICT DO NOTHING`;
  for (const plan of plans) {
    if (existing.has(plan.code)) continue;
    const supplierId = ids.get(plan.supplier);
    if (!supplierId) throw new Error('Missing demo supplier.');
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
        const cost = Math.round(plan.cost * M);
        const transport = Math.round(cost * 0.03);
        const received = plan.received >= 0 ? dayAgo(plan.received) : null;
        const batch = await tx.batch.create({
          data: {
            id: uuid(plan.code),
            code: plan.code,
            name: plan.name,
            supplierId,
            supplierRef: `INV-${plan.code.slice(2)}`,
            boughtOn: dayAgo(Math.max(plan.received, 0) + 3),
            locationId: location.id,
            status: plan.status,
            expectedOn: received ? null : dayAgo(plan.received),
            receivedOn: received,
            itemsExpected: plan.items,
            itemsReceived: received ? plan.items : null,
            costSupplierKobo: BigInt(cost - transport),
            costTransportKobo: BigInt(transport),
            paidFrom: 'business',
            closedAt: plan.status === 'closed' ? dayAgo(5) : null,
            closedReason:
              plan.status === 'closed' ? 'Last items cleared.' : null,
            createdAt: dayAgo(Math.max(plan.received, -1) + 3),
            categories: {
              create: categories.slice(0, 2).map((c) => ({ categoryId: c.id })),
            },
          },
        });
        const total = Math.round(plan.back * M);
        const each = plan.sold ? Math.floor(total / plan.sold) : 0;
        for (let i = 0; i < plan.intaken; i++) {
          const key = `${plan.code}:${i}`;
          const category = categories[(i % 7) % categories.length];
          if (!category || !received) throw new Error('Demo plan error.');
          const sold = i < plan.sold;
          const stuck = !sold && i - plan.sold < (plan.stuck ?? 0);
          const added = new Date(received.getTime() + 10 * 3_600_000);
          // Sales slow down over time, as real ones do.
          const span = Math.max(1, plan.received - 2);
          const soldAt = new Date(
            received.getTime() +
              (1 + span * Math.pow(i / Math.max(1, plan.sold), 1.6)) *
                86_400_000,
          );
          const lot = (suffix: string, status: string) => ({
            id: uuid(key + suffix),
            title: `${category.name} item ${i + 1}, ${plan.code}`,
            description: 'Demo stock for inventory batches.',
            condition: 'open_box',
            retailPriceKobo: BigInt(2_000_000 + (i % 9) * 900_000),
            startPriceKobo: 300_000n,
            categoryId: category.id,
            locationId: location.id,
            supplierId,
            batchId: batch.id,
            status,
            autoRelistEnabled: false,
            originalRunTimeMs: 86_400_000n,
            startAt: added,
            endAt: new Date(added.getTime() + 86_400_000),
            createdAt: added,
            // Kept off the buyer site and out of the working lots list.
            archivedAt: status === 'closed' ? soldAt : null,
          });
          const settlement = (lotId: string) => ({
            lotId,
            namespace: NAMESPACE,
            feeVersion: policy.version,
            streamId: '0-0',
            barrierId: '0-0',
            endAt: added,
            closedAt: soldAt,
            snapshot: {},
          });
          if (stuck) {
            const rounds = [0, 1, 2].map((n) => lot(`:r${n}`, 'closed'));
            await tx.lot.createMany({ data: rounds });
            await tx.lotSettlement.createMany({
              data: rounds.map((r, n) => ({
                ...settlement(r.id),
                status: 'unsold',
                relistLotId: rounds[n + 1]?.id ?? null,
              })),
            });
            continue;
          }
          const row = lot('', sold ? 'closed' : 'draft');
          await tx.lot.create({ data: row });
          if (!sold) continue;
          const money =
            i === plan.sold - 1 ? total - each * (plan.sold - 1) : each;
          const premium = Math.round((money * 15) / 115);
          const invoice = await tx.invoice.create({
            data: {
              id: uuid(key + ':invoice'),
              userId: buyer.id,
              hammerTotalKobo: BigInt(money - premium),
              premiumKobo: BigInt(premium),
              lotFeeKobo: 0n,
              vatKobo: 0n,
              totalKobo: BigInt(money),
              status: 'paid',
              createdAt: soldAt,
            },
          });
          await tx.invoiceLine.create({
            data: {
              invoiceId: invoice.id,
              lotId: row.id,
              hammerKobo: BigInt(money - premium),
              premiumKobo: BigInt(premium),
              lotFeeKobo: 0n,
              vatKobo: 0n,
              totalKobo: BigInt(money),
            },
          });
          await tx.lotSettlement.create({
            data: {
              ...settlement(row.id),
              status: 'paid',
              winnerId: buyer.id,
              groupId: randomUUID(),
              hammerKobo: BigInt(money - premium),
              invoiceId: invoice.id,
            },
          });
        }
        // Closed batches get their unit costs once, while still open.
        if (plan.status === 'closed')
          await tx.batch.update({
            where: { id: batch.id },
            data: { status: 'selling', closedAt: null, autoClose: false },
          });
        await queueBatch(tx, batch.id);
      },
      { timeout: 300_000, maxWait: 30_000 },
    );
    await recalculateQueued(db);
    if (plan.status === 'closed') {
      await db.batch.update({
        where: { id: uuid(plan.code) },
        data: { status: 'closed', closedAt: dayAgo(5) },
      });
      await db.$transaction((tx) => queueBatch(tx, uuid(plan.code)));
      await recalculateQueued(db);
    }
  }
  // The next real batch is B-0345.
  await db.$executeRaw`SELECT setval('batch_code_seq', GREATEST(344, (SELECT last_value FROM batch_code_seq)))`;
}
