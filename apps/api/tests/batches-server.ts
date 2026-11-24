// Node IPC controls exist only in this isolated test process, never in the HTTP API.
import { randomBytes, randomUUID } from 'node:crypto';
import { createApi } from '../src/app';
import { LedgerService } from '../src/ledger/ledger-service';
import { recalculateQueued } from '../src/batches/batch-recalc';
import { encryptPii, hashPii } from '../src/security/pii';
import { seedBatches } from '../prisma/batch-seed';
import { seedLotSetup } from '../prisma/lot-setup-seed';

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (
    process.env.NODE_ENV !== 'test' ||
    !process.send ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname)
  )
    throw new Error('Isolated browser test process required.');
  const app = await createApi({
    databaseUrl: url,
    mode: 'local',
    origins: ['http://localhost:3301'],
    emailProvider: { async sendCode() {} },
  });
  await app.listen(0, '127.0.0.1');
  const { db } = new LedgerService(url);
  await seedLotSetup(db);
  if (process.env.BATCHES_SEED === 'true') await seedBatches(db);
  else await db.supplier.deleteMany();
  const sessions = {} as Record<
    string,
    { token: string; device: string; id: string }
  >;
  for (const role of ['admin', 'intake'] as const) {
    const token = randomBytes(32).toString('base64url');
    const device = randomUUID();
    const email = `${randomUUID()}@example.test`;
    const user = await db.user.create({
      data: {
        name: role === 'admin' ? 'Olumide Sanni' : 'Intake Tester',
        role,
        emailHash: hashPii(email, 'email'),
        emailCiphertext: encryptPii(email, 'email'),
        emailVerifiedAt: new Date(),
        staffCredential: { create: { passwordHash: 'synthetic-not-a-login' } },
      },
    });
    await db.authSession.create({
      data: {
        userId: user.id,
        client: 'web',
        staffAuthenticated: true,
        familyId: randomUUID(),
        deviceHash: hashPii(`web:${device}`, 'auth-device'),
        accessHash: hashPii(token, 'auth-token'),
        refreshHash: hashPii(randomUUID(), 'refresh'),
        accessExpiresAt: new Date(Date.now() + 3600000),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    sessions[role] = { token, device, id: user.id };
  }
  const buyer = await db.user.create({
    data: {
      name: 'Test buyer',
      role: 'buyer',
      emailHash: hashPii(randomUUID(), 'email'),
      emailCiphertext: encryptPii('buyer@example.test', 'email'),
    },
  });
  const namespace = `test:batches:${randomUUID()}:`;
  await db.$executeRaw`INSERT INTO bid_engine_runtime(namespace, redis_run_id) VALUES (${namespace}, 'test')`;
  /** Publish and sell the newest draft lot, with a paid invoice. */
  async function sell(hammerKobo: number, premiumKobo: number) {
    const lot = await db.lot.findFirstOrThrow({
      where: { status: 'draft', batchId: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    const line = {
      hammerKobo: BigInt(hammerKobo),
      premiumKobo: BigInt(premiumKobo),
      lotFeeKobo: 0n,
      vatKobo: 0n,
      totalKobo: BigInt(hammerKobo + premiumKobo),
    };
    const { hammerKobo: hammer, ...fees } = line;
    const invoice = await db.invoice.create({
      data: {
        userId: buyer.id,
        hammerTotalKobo: hammer,
        ...fees,
        status: 'paid',
        lines: { create: { lotId: lot.id, ...line } },
      },
    });
    await db.lot.update({ where: { id: lot.id }, data: { status: 'closed' } });
    const policy = await db.auctionFeePolicy.findFirstOrThrow();
    await db.lotSettlement.create({
      data: {
        lotId: lot.id,
        namespace,
        feeVersion: policy.version,
        streamId: '0-0',
        barrierId: '0-0',
        endAt: lot.startAt,
        closedAt: new Date(),
        snapshot: {},
        status: 'paid',
        winnerId: buyer.id,
        groupId: randomUUID(),
        hammerKobo: BigInt(hammerKobo),
        invoiceId: invoice.id,
      },
    });
  }
  // What the worker does every few seconds.
  setInterval(() => void recalculateQueued(db).catch(() => undefined), 500);
  process.on('message', (message: { command: string; args?: number[] }) => {
    if (message.command === 'stop') process.exit();
    if (message.command === 'sell')
      void sell(message.args?.[0] ?? 0, message.args?.[1] ?? 0)
        .then(() => process.send?.({ done: true }))
        .catch((e: unknown) => process.send?.({ error: String(e) }));
  });
  process.on('disconnect', () => process.exit());
  process.send({ ready: true, url: await app.getUrl(), sessions });
}
main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
