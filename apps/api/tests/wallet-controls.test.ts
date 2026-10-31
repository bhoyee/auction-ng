import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { LedgerService } from '../src/ledger/ledger-service';
import { WalletControlsService } from '../src/payments/wallet-controls-service';
import { PaymentService } from '../src/payments/payment-service';
import type {
  PaymentProvider,
  VerifiedTransfer,
} from '../src/payments/payment-provider';
import { encryptPii, hashPii, decryptPii } from '../src/security/pii';
import { createApi } from '../src/app';
import { AuthService } from '../src/auth/auth-service';
import {
  profileSchema,
  walletControlsUpdateSchema,
  quoteTransferFunding,
} from '@auction-ng/shared';

let ledger: LedgerService, controls: WalletControlsService;
let adminId: string;
const initialize = vi.fn(async (input: { reference: string }) => ({
  authorizationUrl: `https://checkout.paystack.com/${input.reference}`,
}));
const verified = new Map<string, VerifiedTransfer>();
const provider: PaymentProvider = {
  initializeCard: initialize,
  verifySignature: () => true,
  async assignAccount() {
    throw Error('Unexpected DVA');
  },
  async getAccount() {
    return null;
  },
  async verifyTransfer(reference) {
    const result = verified.get(reference);
    if (!result) throw Error('Unknown fixture');
    return result;
  },
  async listTransfers() {
    return [];
  },
};
beforeAll(async () => {
  const url =
    process.env.WALLET_CONTROLS_TEST_DATABASE_URL ??
    process.env.LEDGER_TEST_DATABASE_URL;
  if (!url || !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
    throw Error('Isolated database required');
  ledger = new LedgerService(url);
  controls = new WalletControlsService(ledger);
  adminId = (await actor('admin')).id;
});
afterAll(async () => {
  await ledger?.close();
});
async function actor(
  role: 'admin' | 'buyer' | 'finance' | 'support' = 'buyer',
) {
  const email = randomUUID() + '@example.test';
  return ledger.db.user.create({
    data: {
      name: 'Synthetic wallet controls',
      role,
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
      emailVerifiedAt: new Date(),
    },
  });
}
async function update(depositsEnabled: boolean, withdrawalsEnabled: boolean) {
  const current = await controls.read();
  return controls.update(adminId, {
    depositsEnabled,
    withdrawalsEnabled,
    expectedRevision: current.revision,
    reason: 'Scheduled synthetic maintenance',
    idempotencyKey: randomUUID(),
  });
}
const input = () => ({
  amountKobo: 1000000,
  cardType: 'local' as const,
  feePolicy: 'paystack-card-local-v1' as const,
  acceptedFeeKobo: 25000,
  acceptedCreditKobo: 975000,
  consent: true as const,
  idempotencyKey: randomUUID(),
});
it('allows only active admins, validates strict requests and records encrypted before/after audit once', async () => {
  for (const role of ['buyer', 'finance', 'support'] as const) {
    const user = await actor(role);
    await expect(
      controls.update(user.id, {
        depositsEnabled: false,
        withdrawalsEnabled: false,
        expectedRevision: 0,
        reason: 'Testing permissions',
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow();
  }
  expect(
    walletControlsUpdateSchema.safeParse({
      ...input(),
      depositsEnabled: 'false',
    }).success,
  ).toBe(false);
  const before = await controls.read();
  const request = {
    depositsEnabled: false,
    withdrawalsEnabled: true,
    expectedRevision: before.revision,
    reason: 'Pause new deposits',
    idempotencyKey: randomUUID(),
  };
  const replies = await Promise.all([
    controls.update(adminId, request),
    controls.update(adminId, request),
  ]);
  expect(replies[0]).toEqual(replies[1]);
  expect(replies[0]?.revision).toBe(before.revision + 1);
  const audits = await ledger.db.auditLog.findMany({
    where: {
      action: 'wallet.controls_updated',
      entityId: request.idempotencyKey,
    },
  });
  expect(audits).toHaveLength(1);
  const encrypted = audits[0]?.afterCiphertext;
  if (!encrypted) throw Error('Audit missing');
  expect(JSON.parse(decryptPii(Buffer.from(encrypted), 'audit'))).toMatchObject(
    { depositsEnabled: false },
  );
  await expect(
    controls.update(adminId, { ...request, depositsEnabled: true }),
  ).rejects.toThrow();
  await update(true, true);
});
it('prevents stale saves from overwriting newer settings under concurrent updates', async () => {
  const before = await controls.read();
  const request = {
    expectedRevision: before.revision,
    reason: 'Concurrent controls check',
    idempotencyKey: randomUUID(),
    depositsEnabled: false,
    withdrawalsEnabled: true,
  };
  const results = await Promise.allSettled([
    controls.update(adminId, request),
    controls.update(adminId, {
      ...request,
      idempotencyKey: randomUUID(),
      depositsEnabled: true,
      withdrawalsEnabled: false,
    }),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  await update(true, true);
});
it('blocks new card and transfer funding but lets existing intent retries and verified credits finish', async () => {
  const buyer = await actor();
  const service = new PaymentService(ledger, provider);
  const request = input();
  const checkout = await service.initializeCard(buyer.id, request);
  await update(false, true);
  try {
    const before = initialize.mock.calls.length;
    await expect(service.initializeCard(buyer.id, input())).rejects.toThrow();
    const transferQuote = quoteTransferFunding(1000000);
    await expect(
      service.initializeTransfer(buyer.id, {
        amountKobo: 1000000,
        feePolicy: transferQuote.feePolicy,
        acceptedFeeKobo: transferQuote.feeKobo,
        acceptedCreditKobo: transferQuote.creditKobo,
        consent: true,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow('temporarily paused');
    expect(initialize.mock.calls).toHaveLength(before);
    expect((await service.initializeCard(buyer.id, request)).paymentId).toBe(
      checkout.paymentId,
    );
    const row = await ledger.db.payment.findUniqueOrThrow({
      where: { id: checkout.paymentId },
    });
    verified.set(row.providerRef, {
      reference: row.providerRef,
      customerCode: 'CUS_fixture',
      customerEmail: decryptPii(
        Buffer.from(buyer.emailCiphertext ?? []),
        'email',
      ),
      cardCountry: 'NG',
      amountKobo: 1000000,
      feeKobo: 25000,
      currency: 'NGN',
      domain: 'test',
      status: 'success',
      channel: 'card',
    });
    await Promise.all([
      service.confirmCard(buyer.id, row.id),
      service.confirmCard(buyer.id, row.id),
    ]);
    expect((await ledger.balances(row.walletId)).availableKobo).toBe(975000n);
  } finally {
    await update(true, true);
  }
});
it('serializes new deposit intent creation against an administrator pause', async () => {
  const buyer = await actor(),
    service = new PaymentService(ledger, provider),
    request = input();
  const [payment] = await Promise.allSettled([
    service.initializeCard(buyer.id, request),
    update(false, true),
  ]);
  const count = await ledger.db.payment.count({ where: { userId: buyer.id } });
  expect(count).toBe(payment.status === 'fulfilled' ? 1 : 0);
  await expect(service.initializeCard(buyer.id, input())).rejects.toThrow();
  await update(true, true);
});
it('enforces authenticated buyer/admin roles and strict API request validation', async () => {
  const app = await createApi({
    databaseUrl:
      process.env.WALLET_CONTROLS_TEST_DATABASE_URL ??
      process.env.LEDGER_TEST_DATABASE_URL,
    mode: 'local',
    bidOptions: { enabled: false },
  });
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  try {
    expect((await fetch(base + '/admin/wallet-controls')).status).toBe(401);
    const auth = app.get(AuthService);
    const identity = (role: 'buyer' | 'admin') => ({
      sessionId: randomUUID(),
      user: profileSchema.parse({
        id: adminId,
        name: 'Synthetic admin',
        role,
        status: 'active',
        email: 'admin@example.test',
        emailVerified: true,
        phone: null,
        phoneVerified: false,
        address: null,
        passwordSet: true,
      }),
    });
    const authentication = vi
      .spyOn(auth, 'authenticate')
      .mockResolvedValue(identity('buyer'));
    expect((await fetch(base + '/admin/wallet-controls')).status).toBe(403);
    expect((await fetch(base + '/wallet/controls')).status).toBe(200);
    authentication.mockResolvedValue(identity('admin'));
    expect((await fetch(base + '/admin/wallet-controls')).status).toBe(200);
    expect(
      (
        await fetch(base + '/admin/wallet-controls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ depositsEnabled: false, unknown: true }),
        })
      ).status,
    ).toBe(400);
  } finally {
    vi.restoreAllMocks();
    await app.close();
  }
});
