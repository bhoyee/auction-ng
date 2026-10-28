import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { randomUUID, randomInt } from 'node:crypto';
import { createClient } from 'redis';
import { BidService } from '../src/bids/bid-service';
import { LedgerService } from '../src/ledger/ledger-service';
import { ClosingService } from '../src/closing/closing-service';
import { CLOSE_LUA } from '../src/closing/close-lua';
import { calculateInvoiceLine, estimatedTotal } from '@auction-ng/shared';
import { encryptPii, hashPii } from '../src/security/pii';
import { InsufficientFundsError } from '../src/ledger/ledger-errors';
import { NotificationService } from '../src/closing/notification-service';
import { createApi } from '../src/app';
import { startClosingWorker } from '../../worker/src/closing-worker';
import { createClosingClient } from '../../../packages/api-client/src/closing';

let ledger: LedgerService;
let bids: BidService;
let closer: ClosingService;
let redis: ReturnType<typeof createClient>;
let categoryId: string;
let locationId: string;
beforeAll(async () => {
  const url = process.env.BID_TEST_DATABASE_URL;
  if (!url || !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
    throw new Error('Isolated bid database required.');
  ledger = new LedgerService(url);
  bids = new BidService(ledger, {
    enabled: true,
    prefix: `test:closing:${randomUUID()}:`,
  });
  await bids.start();
  closer = new ClosingService(ledger, bids);
  redis = createClient({ url: process.env.REDIS_URL });
  await redis.connect();
  categoryId = (
    await ledger.db.category.create({
      data: { name: 'Closing test', slug: randomUUID() },
    })
  ).id;
  locationId = (
    await ledger.db.location.create({
      data: {
        code: randomUUID().slice(0, 30),
        name: 'Ikeja test hub',
        address: 'Synthetic Lagos address',
        hours: {},
        capacityPerSlot: 20,
      },
    })
  ).id;
});
afterAll(async () => {
  await redis?.quit();
  await bids?.close();
  await ledger?.close();
});
async function buyer() {
  const email = `${randomUUID()}@example.test`;
  const phone = `+234${randomInt(1000000000, 9999999999)}`;
  const user = await ledger.db.user.create({
    data: {
      name: 'Chiamaka',
      emailCiphertext: encryptPii(email, 'email'),
      emailHash: hashPii(email, 'email'),
      phoneCiphertext: encryptPii(phone, 'phone'),
      phoneHash: hashPii(phone, 'phone'),
      phoneVerifiedAt: new Date(),
      emailVerifiedAt: new Date(),
    },
  });
  const wallet = await ledger.openWallet(user.id);
  await ledger.topup({
    walletId: wallet.id,
    amountKobo: 10000000n,
    idempotencyKey: randomUUID(),
    reference: randomUUID(),
  });
  const session = await ledger.db.authSession.create({
    data: {
      userId: user.id,
      familyId: randomUUID(),
      deviceHash: '0'.repeat(64),
      client: 'web',
      accessHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
      refreshHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
      accessExpiresAt: new Date(Date.now() + 900000),
      expiresAt: new Date(Date.now() + 900000),
    },
  });
  return {
    userId: user.id,
    sessionId: session.id,
    walletId: wallet.id,
    token: randomUUID(),
    device: randomUUID(),
  };
}
async function lot(endAt = new Date(Date.now() + 300000)) {
  return ledger.db.lot.create({
    data: {
      title: 'Hisense kettle',
      description: 'Synthetic closing fixture',
      condition: 'open_box',
      retailPriceKobo: 1000000n,
      startPriceKobo: 50000n,
      status: 'open',
      startAt: new Date(Date.now() - 1000),
      endAt,
      categoryId,
      locationId,
    },
  });
}
async function bid(
  who: Awaited<ReturnType<typeof buyer>>,
  id: string,
  amount: number,
  mode: 'direct' | 'automatic' = 'direct',
) {
  const input = { maxKobo: amount, mode, idempotencyKey: randomUUID() };
  const p = await bids.prepare(who, id, input, who.token, who.device);
  await bids.accept(
    id,
    { preparationId: p.preparationId, idempotencyKey: input.idempotencyKey },
    who.token,
    who.device,
  );
  return p;
}
async function freeze(id: string, now = Date.now() + 600000) {
  // Only fixtures supply the Lua clock override; the production call always uses Redis TIME.
  return JSON.parse(
    String(
      await redis.eval(CLOSE_LUA, {
        keys: [bids.prefix],
        arguments: [id, String(now)],
      }),
    ),
  ) as { status: string };
}
it('retries no-bid stock twice, preserving condition and history under concurrent closing', async () => {
  const original = await lot();
  await ledger.db.lotImage.create({
    data: {
      lotId: original.id,
      url: 'https://example.test/item.webp',
      sortOrder: 0,
    },
  });
  let current = original;
  for (let attempt = 1; attempt <= 3; attempt++) {
    await bids.snapshot(null, current.id);
    await freeze(current.id, Date.now() + 2 * 86400000);
    await Promise.all(
      Array.from({ length: 6 }, () => closer.closeLot(current.id)),
    );
    const settled = await ledger.db.lotSettlement.findUniqueOrThrow({
      where: { lotId: current.id },
    });
    expect(settled.status).toBe('unsold');
    expect(settled.invoiceId).toBeNull();
    expect(
      (await ledger.db.lot.findUniqueOrThrow({ where: { id: current.id } }))
        .status,
    ).toBe('closed');
    if (attempt === 3) {
      expect(settled.relistLotId).toBeNull();
      break;
    }
    const next = await ledger.db.lot.findUniqueOrThrow({
      where: { id: settled.relistLotId ?? '' },
      include: { images: true },
    });
    expect(next.autoRelistCount).toBe(attempt);
    expect(next.status).toBe('open');
    expect(next.lotNumber).not.toBe(current.lotNumber);
    expect(next.endAt.getTime() - next.startAt.getTime()).toBe(86400000);
    for (const key of [
      'condition',
      'title',
      'description',
      'categoryId',
      'locationId',
      'startPriceKobo',
      'retailPriceKobo',
    ] as const)
      expect(next[key]).toBe(original[key]);
    expect(next.images[0]?.url).toBe('https://example.test/item.webp');
    expect(await ledger.db.bid.count({ where: { lotId: next.id } })).toBe(0);
    current = next;
  }
});
it('keeps opted-out no-bid stock unsold without a new auction', async () => {
  const item = await lot();
  await ledger.db.lot.update({
    where: { id: item.id },
    data: { autoRelistEnabled: false },
  });
  await bids.snapshot(null, item.id);
  await freeze(item.id);
  await closer.closeLot(item.id);
  expect(
    (
      await ledger.db.lotSettlement.findUniqueOrThrow({
        where: { lotId: item.id },
      })
    ).relistLotId,
  ).toBeNull();
});
it.each(['new', 'like_new', 'open_box', 'damaged', 'untested'])(
  'retains the %s condition on a new no-bid auction',
  async (condition) => {
    const item = await lot();
    await ledger.db.lot.update({ where: { id: item.id }, data: { condition } });
    await bids.snapshot(null, item.id);
    await freeze(item.id);
    await closer.closeLot(item.id);
    const result = await ledger.db.lotSettlement.findUniqueOrThrow({
      where: { lotId: item.id },
    });
    const next = await ledger.db.lot.findUniqueOrThrow({
      where: { id: result.relistLotId ?? '' },
    });
    expect(next.condition).toBe(condition);
    expect(
      await ledger.db.searchIndexJob.findUnique({ where: { lotId: next.id } }),
    ).not.toBeNull();
    expect(
      await ledger.db.auditLog.count({
        where: { entityId: item.id, action: 'lots.unsold_auto_relisted' },
      }),
    ).toBe(1);
  },
);
it('freezes before charging, drains unpersisted bids, captures additive holds once and returns unused funds', async () => {
  const who = await buyer();
  const item = await lot();
  await bid(who, item.id, 500000, 'automatic');
  await bid(who, item.id, 800000, 'automatic');
  expect(await ledger.db.bid.count({ where: { lotId: item.id } })).toBe(0);
  await freeze(item.id);
  await Promise.all(Array.from({ length: 6 }, () => closer.closeLot(item.id)));
  const result = await ledger.db.lotSettlement.findUniqueOrThrow({
    where: { lotId: item.id },
  });
  expect(result.status).toBe('paid');
  expect(result.hammerKobo).toBe(50000n);
  expect(await ledger.balances(who.walletId)).toEqual({
    availableKobo: 10000000n - BigInt(estimatedTotal(50000)),
    heldKobo: 0n,
  });
  expect(await ledger.db.invoiceLine.count({ where: { lotId: item.id } })).toBe(
    1,
  );
  expect(await ledger.db.bid.count({ where: { lotId: item.id } })).toBe(2);
  expect(
    await ledger.db.fulfilment.count({
      where: { invoiceId: result.invoiceId ?? '' },
    }),
  ).toBe(1);
  expect(
    await ledger.db.notification.count({
      where: { reference: `settlement:${item.id}:paid` },
    }),
  ).toBe(1);
  const invoice = await ledger.db.invoice.findUniqueOrThrow({
    where: { id: result.invoiceId ?? '' },
    include: { lines: true },
  });
  expect(invoice.status).toBe('paid');
  expect(invoice.number).toMatch(/^INV-[2-9A-HJ-NP-Z]{8}$/);
  expect(item.lotNumber).toMatch(/^LOT-[2-9A-HJ-NP-Z]{8}$/);
  expect(invoice.totalKobo).toBe(BigInt(calculateInvoiceLine(50000).totalKobo));
  const pass = await closer.pickupPass(who.userId, invoice.id);
  expect(pass.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  await expect(closer.pickupPass(randomUUID(), invoice.id)).rejects.toThrow();
});
it('keeps soft-close extensions open and serializes the final bid against closing', async () => {
  const who = await buyer();
  const item = await lot(new Date(Date.now() + 60000));
  await bid(who, item.id, 100000);
  expect((await freeze(item.id, Date.now() + 65000)).status).toBe('extended');
  expect(
    await ledger.db.lotSettlement.count({ where: { lotId: item.id } }),
  ).toBe(0);
  const p = await bids.prepare(
    who,
    item.id,
    { maxKobo: 200000, idempotencyKey: randomUUID() },
    who.token,
    who.device,
  );
  await freeze(item.id);
  await expect(
    bids.accept(
      item.id,
      { preparationId: p.preparationId, idempotencyKey: p.idempotencyKey },
      who.token,
      who.device,
    ),
  ).rejects.toThrow();
  await closer.closeLot(item.id);
  expect(
    (
      await ledger.db.lotSettlement.findUniqueOrThrow({
        where: { lotId: item.id },
      })
    ).hammerKobo,
  ).toBe(100000n);
});
it('rolls back failed captures and retries without a buyer strike or a duplicate invoice', async () => {
  const who = await buyer();
  const item = await lot();
  await bid(who, item.id, 100000);
  await freeze(item.id);
  const spy = vi
    .spyOn(ledger, 'captureGroupInTransaction')
    .mockRejectedValueOnce(new Error('Synthetic database outage'));
  await expect(closer.closeLot(item.id)).rejects.toThrow();
  spy.mockRestore();
  expect(
    (
      await ledger.db.lotSettlement.findUniqueOrThrow({
        where: { lotId: item.id },
      })
    ).status,
  ).toBe('frozen');
  expect(await ledger.db.invoiceLine.count({ where: { lotId: item.id } })).toBe(
    0,
  );
  expect(await ledger.db.strike.count({ where: { userId: who.userId } })).toBe(
    0,
  );
  await closer.closeLot(item.id);
  expect(
    (
      await ledger.db.lotSettlement.findUniqueOrThrow({
        where: { lotId: item.id },
      })
    ).status,
  ).toBe('paid');
});
it('gives an insufficient-funds result 24 hours and retries successfully without a duplicate notification or strike', async () => {
  const who = await buyer();
  const item = await lot();
  await bid(who, item.id, 100000);
  await freeze(item.id);
  const spy = vi
    .spyOn(ledger, 'captureGroupInTransaction')
    .mockRejectedValueOnce(new InsufficientFundsError('Synthetic shortage'));
  await closer.closeLot(item.id);
  spy.mockRestore();
  const row = await ledger.db.lotSettlement.findUniqueOrThrow({
    where: { lotId: item.id },
  });
  expect(row.status).toBe('payment_due');
  expect((row.paymentDueAt?.getTime() ?? 0) - Date.now()).toBeGreaterThan(
    86390000,
  );
  await expect(
    closer.pickupPass(who.userId, row.invoiceId ?? ''),
  ).rejects.toThrow();
  await closer.closeLot(item.id);
  expect(
    (
      await ledger.db.lotSettlement.findUniqueOrThrow({
        where: { lotId: item.id },
      })
    ).status,
  ).toBe('paid');
  expect(await ledger.db.invoiceLine.count({ where: { lotId: item.id } })).toBe(
    1,
  );
  expect(await ledger.db.strike.count({ where: { userId: who.userId } })).toBe(
    0,
  );
});
it('rolls back a crash after ledger postings, then charges the same frozen result exactly once', async () => {
  const who = await buyer();
  const item = await lot();
  await bid(who, item.id, 100000);
  await freeze(item.id);
  const original = ledger.captureGroupInTransaction.bind(ledger);
  const spy = vi
    .spyOn(ledger, 'captureGroupInTransaction')
    .mockImplementationOnce(async (tx, input) => {
      await original(tx, input);
      throw new Error('Synthetic crash after postings');
    });
  await expect(closer.closeLot(item.id)).rejects.toThrow();
  spy.mockRestore();
  expect((await ledger.balances(who.walletId)).heldKobo).toBe(
    BigInt(estimatedTotal(100000)),
  );
  expect(
    await ledger.db.ledgerTransaction.count({
      where: { walletId: who.walletId, operation: 'capture' },
    }),
  ).toBe(0);
  await closer.closeLot(item.id);
  expect((await ledger.balances(who.walletId)).heldKobo).toBe(0n);
  await expect(
    ledger.db.lotSettlement.update({
      where: { lotId: item.id },
      data: { hammerKobo: 1n },
    }),
  ).rejects.toThrow();
});
it('releases every losing reservation without charging the losing buyer', async () => {
  const a = await buyer(),
    b = await buyer();
  const item = await lot();
  await bid(a, item.id, 100000);
  await bid(b, item.id, 200000);
  await freeze(item.id);
  await closer.closeLot(item.id);
  expect(await ledger.balances(a.walletId)).toEqual({
    availableKobo: 10000000n,
    heldKobo: 0n,
  });
  expect(
    (
      await ledger.db.lotSettlement.findUniqueOrThrow({
        where: { lotId: item.id },
      })
    ).winnerId,
  ).toBe(b.userId);
});
it('defaults a reported unpaid win once after 24 hours, fences bidding and creates a staff-scheduled draft relisting', async () => {
  const who = await buyer();
  const item = await lot();
  await bid(who, item.id, 100000);
  await freeze(item.id);
  const failure = vi
    .spyOn(ledger, 'captureGroupInTransaction')
    .mockRejectedValueOnce(new InsufficientFundsError('Synthetic shortage'));
  await closer.closeLot(item.id);
  failure.mockRestore();
  await ledger.db.lotSettlement.update({
    where: { lotId: item.id },
    data: { paymentDueAt: new Date(Date.now() - 1000) },
  });
  // Fault-inject a shortage report at the funds-read boundary. The real funded
  // path reserves the full total and ordinarily cannot enter this fallback.
  const readFunds = ledger.fundsForHoldsInTransaction.bind(ledger);
  const funds = vi
    .spyOn(ledger, 'fundsForHoldsInTransaction')
    .mockImplementationOnce(async (tx, walletId, holdIds) => {
      await readFunds(tx, walletId, holdIds);
      return 0n;
    });
  try {
    await closer.closeLot(item.id);
    expect(funds).toHaveBeenCalledTimes(1);
    expect(
      (
        await ledger.db.lotSettlement.findUniqueOrThrow({
          where: { lotId: item.id },
        })
      ).status,
    ).toBe('defaulted');
  } finally {
    funds.mockRestore();
  }
  await closer.closeLot(item.id);
  const row = await ledger.db.lotSettlement.findUniqueOrThrow({
    where: { lotId: item.id },
  });
  expect(row.status).toBe('defaulted');
  expect(
    (
      await ledger.db.lot.findUniqueOrThrow({
        where: { id: row.relistLotId ?? '' },
      })
    ).status,
  ).toBe('draft');
  expect(
    (await ledger.db.lot.findUniqueOrThrow({ where: { id: item.id } })).status,
  ).toBe('closed');
  expect(
    await ledger.db.strike.count({
      where: { reference: `settlement:${item.id}` },
    }),
  ).toBe(1);
  expect(
    (
      await ledger.db.invoice.findUniqueOrThrow({
        where: { id: row.invoiceId ?? '' },
      })
    ).status,
  ).toBe('cancelled');
  expect(await ledger.balances(who.walletId)).toEqual({
    availableKobo: 10000000n,
    heldKobo: 0n,
  });
});
it('sends committed winner receipts to the local inbox, with no pickup token or private maximum in email', async () => {
  const who = await buyer();
  const item = await lot();
  await bid(who, item.id, 100000);
  await freeze(item.id);
  await closer.closeLot(item.id);
  const previous = process.env.AUTH_MODE;
  process.env.AUTH_MODE = 'local';
  try {
    await new NotificationService(ledger).deliver();
  } finally {
    if (previous === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = previous;
  }
  expect(
    (
      await ledger.db.notification.findUniqueOrThrow({
        where: { reference: `settlement:${item.id}:paid` },
      })
    ).status,
  ).toBe('sent');
  const messages = (await (
    await fetch(
      new URL(
        '/api/v1/messages',
        process.env.MAILPIT_URL ?? 'http://localhost:8025',
      ),
    )
  ).json()) as { messages: { ID: string; Subject: string }[] };
  const message = messages.messages.find((m) =>
    m.Subject.includes(item.lotNumber),
  );
  expect(message).toBeDefined();
  const body = (await (
    await fetch(
      new URL(
        `/api/v1/message/${message?.ID}`,
        process.env.MAILPIT_URL ?? 'http://localhost:8025',
      ),
    )
  ).json()) as { HTML: string; Text: string };
  expect(body.HTML).toContain('Paid from your wallet');
  expect(body.Text).toContain('Buyer premium');
  const result = await ledger.db.lotSettlement.findUniqueOrThrow({
    where: { lotId: item.id },
  });
  const pass = await closer.pickupPass(who.userId, result.invoiceId ?? '');
  expect(body.HTML).not.toContain(pass.token);
  expect(body.Text).not.toContain(pass.token);
});
it('serializes a simultaneous final acceptance and freeze into one correct winner', async () => {
  const who = await buyer();
  const item = await lot();
  await bid(who, item.id, 100000);
  const input = { maxKobo: 200000, idempotencyKey: randomUUID() };
  const p = await bids.prepare(who, item.id, input, who.token, who.device);
  const [, accepted] = await Promise.allSettled([
    freeze(item.id),
    bids.accept(
      item.id,
      { preparationId: p.preparationId, idempotencyKey: input.idempotencyKey },
      who.token,
      who.device,
    ),
  ]);
  await closer.closeLot(item.id);
  const result = await ledger.db.lotSettlement.findUniqueOrThrow({
    where: { lotId: item.id },
  });
  expect(result.hammerKobo).toBe(
    accepted.status === 'fulfilled' ? 200000n : 100000n,
  );
});
it('runs the real scheduled worker through the authenticated internal API and typed client', async () => {
  const who = await buyer();
  const item = await lot();
  await bid(who, item.id, 100000);
  await freeze(item.id);
  await ledger.db.lot.update({
    where: { id: item.id },
    data: { endAt: new Date(Date.now() - 1000) },
  });
  const previous = process.env.BID_MAINTENANCE_TOKEN;
  const token = randomUUID() + randomUUID();
  process.env.BID_MAINTENANCE_TOKEN = token;
  const app = await createApi({
    databaseUrl: process.env.BID_TEST_DATABASE_URL,
    mode: 'local',
    bidOptions: { enabled: true, prefix: bids.prefix },
  });
  let worker: Awaited<ReturnType<typeof startClosingWorker>> | undefined;
  try {
    await app.listen(0, '127.0.0.1');
    const apiUrl = await app.getUrl();
    expect(
      (
        await fetch(new URL('/internal/lots/close', apiUrl), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(401);
    const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
    worker = await startClosingWorker(
      {
        host: url.hostname,
        port: Number(url.port || 6379),
        db: Number(url.pathname.slice(1) || 0),
        username: url.username || undefined,
        password: url.password || undefined,
      },
      { token, apiUrl, queueName: `test-closing-${randomUUID()}` },
    );
    const deadline = Date.now() + 20000;
    while (
      (await ledger.db.lotSettlement.findUnique({ where: { lotId: item.id } }))
        ?.status !== 'paid' &&
      Date.now() < deadline
    )
      await new Promise((resolve) => setTimeout(resolve, 100));
    expect(
      (
        await ledger.db.lotSettlement.findUniqueOrThrow({
          where: { lotId: item.id },
        })
      ).status,
    ).toBe('paid');
    expect((await createClosingClient(apiUrl, token)()).failed).toBe(0);
  } finally {
    await worker?.close();
    await app.close();
    if (previous === undefined) delete process.env.BID_MAINTENANCE_TOKEN;
    else process.env.BID_MAINTENANCE_TOKEN = previous;
  }
}, 30000);
it('closes 1,000 mixed sold/unsold lots within ten minutes with exact charges', async () => {
  const items = Array.from({ length: 1000 }, () => ({
    id: randomUUID(),
    title: 'Synthetic unsold lot',
    description: 'Test',
    condition: 'open_box',
    retailPriceKobo: 100000n,
    startPriceKobo: 50000n,
    status: 'open',
    startAt: new Date(Date.now() - 60000),
    endAt: new Date(Date.now() + 300000),
    categoryId,
    locationId,
  }));
  await ledger.db.lot.createMany({ data: items });
  const funded = await buyer();
  for (const item of items.slice(0, 20)) {
    await bid(funded, item.id, 50000);
    await freeze(item.id);
  }
  await ledger.db.lot.updateMany({
    where: { id: { in: items.map((i) => i.id) } },
    data: { endAt: new Date(Date.now() - 1000) },
  });
  const start = performance.now();
  for (let i = 0; i < 25; i++) await closer.run();
  expect(
    await ledger.db.lotSettlement.count({
      where: { lotId: { in: items.map((i) => i.id) }, status: 'unsold' },
    }),
  ).toBe(980);
  expect(
    await ledger.db.lotSettlement.count({
      where: { lotId: { in: items.map((i) => i.id) }, status: 'paid' },
    }),
  ).toBe(20);
  expect(await ledger.balances(funded.walletId)).toEqual({
    availableKobo: 10000000n - BigInt(20 * estimatedTotal(50000)),
    heldKobo: 0n,
  });
  const elapsed = performance.now() - start;
  console.info(`1,000 mixed lot closures: ${Math.round(elapsed)}ms`);
  expect(elapsed).toBeLessThan(600000);
}, 600000);
