// Node IPC controls exist only in this isolated test process, never in the HTTP API.
import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { createApi } from '../src/app';
import { LedgerService } from '../src/ledger/ledger-service';
import { BidService } from '../src/bids/bid-service';
import { ClosingService } from '../src/closing/closing-service';
import { CLOSE_LUA } from '../src/closing/close-lua';
import { createRealtime } from '../../realtime/src/server';
import { quoteCardFunding, merchandisingRules } from '@auction-ng/shared';
import type {
  PaymentProvider,
  VerifiedTransfer,
} from '../src/payments/payment-provider';
import { createAuthClient } from '../../../packages/api-client/src/auth';
import { createBidClient } from '../../../packages/api-client/src/bids';
import { CatalogueService } from '../src/catalogue/catalogue-service';
import { encryptPii, hashPii } from '../src/security/pii';

async function main() {
  const redesign = process.env.REDESIGN_DEMO === 'true';
  const databaseName = new URL(process.env.DATABASE_URL ?? '').pathname;
  process.send?.({ phase: 'Starting isolated buyer API' });
  if (
    process.env.NODE_ENV !== 'test' ||
    !process.send ||
    !(redesign
      ? /^\/auction_ng_demo_[a-f0-9]{16}$/.test(databaseName)
      : /^\/auction_ng_test_[a-f0-9]{16}$/.test(databaseName))
  )
    throw new Error('Isolated browser test process required.');
  const codes = new Map<string, string>();
  const transfers = new Map<string, VerifiedTransfer>();
  const prefix = redesign
    ? (process.env.BID_NAMESPACE ?? '')
    : `test:web:${randomUUID()}:`;
  if (redesign && prefix !== `auction:demo:${databaseName.slice(1)}:`)
    throw new Error('Isolated demo namespace required.');
  const apiPort = redesign ? 4450 : 4400;
  const realtimePort = redesign ? 4451 : 4401;
  const apiOrigin = `http://localhost:${apiPort}`;
  const provider: PaymentProvider = {
    async listBanks() {
      return {
        items: [{ code: '007', name: 'Isolated test bank' }],
        nextCursor: null,
      };
    },
    async initializeCard(input) {
      const quote = quoteCardFunding(input.amountKobo, 'local');
      transfers.set(input.reference, {
        reference: input.reference,
        customerCode: 'CUS_TEST',
        amountKobo: input.amountKobo,
        feeKobo: quote.feeKobo,
        currency: 'NGN',
        domain: 'test',
        status: 'success',
        channel: 'card',
        customerEmail: input.email,
        cardCountry: 'NG',
      });
      return {
        authorizationUrl:
          'https://checkout.paystack.com/auction-ng-isolated-test',
      };
    },
    verifySignature() {
      return false;
    },
    async assignAccount() {
      throw new Error('Not configured');
    },
    async getAccount() {
      return null;
    },
    async verifyTransfer(reference) {
      const value = transfers.get(reference);
      if (!value) throw new Error('Unknown synthetic reference');
      return value;
    },
    async listTransfers() {
      return [...transfers.keys()];
    },
  };
  const app = await createApi({
    mode: 'local',
    origins: ['http://localhost:3310'],
    emailProvider: {
      async sendCode(email, code) {
        codes.set(email, code);
      },
    },
    paymentProvider: provider,
    bidOptions: {
      enabled: true,
      prefix,
      redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    },
  });
  process.send?.({ phase: 'Isolated buyer API created' });
  await app.listen(apiPort, '127.0.0.1');
  process.send?.({ phase: 'Isolated buyer API listening' });
  const ledger = app.get(LedgerService);
  const bids = app.get(BidService);
  if (redesign) {
    // The isolated browser fixture must explicitly curate its stock too.
    const email = `merchandising-fixture-${randomUUID()}@example.test`;
    const curator = await ledger.db.user.create({
      data: {
        name: 'Synthetic catalogue curator',
        role: 'admin',
        emailHash: hashPii(email, 'email'),
        emailCiphertext: encryptPii(email, 'email'),
      },
    });
    const choices = await ledger.db.lot.findMany({
      where: {
        status: 'open',
        endAt: {
          gt: new Date(Date.now() + merchandisingRules.closingWindowMs),
        },
      },
      orderBy: { id: 'asc' },
      take: 12,
    });
    for (const [position, choice] of choices.entries())
      await app.get(CatalogueService).editTopDeal(curator.id, choice.id, {
        isTopDeal: true,
        topDealOrder: position,
        expectedUpdatedAt: choice.updatedAt.toISOString(),
      });
  }
  const seeded = redesign
    ? await ledger.db.lot.findFirstOrThrow({
        where: { status: 'open', endAt: { gt: new Date() } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: { category: true, location: true },
      })
    : null;
  const category =
    seeded?.category ??
    (await ledger.db.category.create({
      data: { name: 'Home appliances', slug: randomUUID() },
    }));
  const location =
    seeded?.location ??
    (await ledger.db.location.create({
      data: {
        name: 'Ikeja test warehouse',
        code: randomUUID().slice(0, 30),
        address: 'Synthetic test location',
        hours: {},
        capacityPerSlot: 20,
      },
    }));
  const lot =
    seeded ??
    (await ledger.db.lot.create({
      data: {
        title: 'Hisense electric kettle',
        description:
          'Open box. Body inspected; plug and kettle included. This is an isolated test listing.',
        condition: 'open_box',
        retailPriceKobo: 1500000n,
        startPriceKobo: 50000n,
        categoryId: category.id,
        locationId: location.id,
        status: 'open',
        startAt: new Date(Date.now() - 1000),
        endAt: new Date(Date.now() + 600000),
      },
    }));
  await bids.loadLot(lot.id);
  process.send?.({ phase: 'Isolated auction loaded' });
  const realtime = await createRealtime(
    process.env.REDIS_URL ?? 'redis://localhost:6379',
    {
      namespace: prefix,
      apiUrl: apiOrigin,
      origins: ['http://localhost:3310'],
    },
  );
  process.send?.({ phase: 'Isolated realtime gateway created' });
  await new Promise<void>((resolve) =>
    realtime.http.listen(realtimePort, '127.0.0.1', resolve),
  );
  const redis = createClient({
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  });
  await redis.connect();
  process.on('message', (message) => {
    if (!message || typeof message !== 'object' || !('command' in message))
      return;
    const input = message as {
      command: string;
      email?: string;
      requestId?: string;
    };
    void (async () => {
      let result: unknown = null;
      if (input.command === 'code') result = codes.get(input.email ?? '');
      if (input.command === 'outbid') {
        const email = `${randomUUID()}@example.test`;
        const deviceId = randomUUID();
        const auth = createAuthClient(apiOrigin, {
          client: 'web',
          deviceId,
          origin: 'http://localhost:3310',
        });
        const challenge = await auth.requestCode(email);
        const code = codes.get(email);
        if (!code) throw new Error('Missing fixture code');
        const tokens = await auth.verifyCode(challenge.challengeId, code);
        const wallet = await ledger.openWallet(tokens.user.id);
        await ledger.topup({
          walletId: wallet.id,
          amountKobo: 5000000n,
          idempotencyKey: randomUUID(),
          reference: randomUUID(),
        });
        const client = createBidClient(apiOrigin, {
          accessToken: tokens.accessToken,
          deviceId,
        });
        const key = randomUUID();
        const preparation = await client.prepare(lot.id, {
          maxKobo: 200000,
          mode: 'direct',
          idempotencyKey: key,
        });
        result = await client.confirm(lot.id, {
          preparationId: preparation.preparationId,
          idempotencyKey: key,
        });
      }
      if (input.command === 'close') {
        await redis.eval(CLOSE_LUA, {
          keys: [prefix],
          arguments: [lot.id, String(Date.now() + 900000)],
        });
        await app.get(ClosingService).closeLot(lot.id);
        result = await ledger.db.lotSettlement.findUniqueOrThrow({
          where: { lotId: lot.id },
          select: { invoiceId: true, status: true },
        });
      }
      if (input.command === 'stop') {
        process.send?.({ requestId: input.requestId, result: null });
        await realtime.close();
        await redis.quit();
        await app.close();
        process.exit(0);
      }
      process.send?.({ requestId: input.requestId, result });
    })().catch((error: unknown) =>
      process.send?.({
        requestId: input.requestId,
        error: `Isolated browser ${input.command} failed (${error instanceof Error ? error.name : 'unknown'}${error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? ` ${error.code}` : ''})`,
      }),
    );
  });
  process.send?.({ ready: true, lotId: lot.id, categoryId: category.id });
}
void main().catch(() => {
  console.error('Isolated browser API failed to start.');
  process.exit(1);
});
