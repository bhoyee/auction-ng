import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  calculateFixedPrice,
  estimatedTotal,
  PURCHASE_UNLOCK_MS,
} from '@auction-ng/shared';
import { createApi } from '../src/app';
import { LedgerService } from '../src/ledger/ledger-service';
import { encryptPii, hashPii } from '../src/security/pii';
import {
  hashStaffPassword,
  newTotpSecret,
  totpCode,
} from '../src/auth/staff-crypto';
import { createAuthClient } from '../../../packages/api-client/src/auth';
import { createBidClient } from '../../../packages/api-client/src/bids';
import { createPurchaseClient } from '../../../packages/api-client/src/purchases';
import { createPurchaseUnlockClient } from '../../../packages/api-client/src/purchase-unlock';

// Owner decision 2026-11-26: bids, pre-bids and Buy Now need password, an
// email code and the authenticator (when on) first; then 30 minutes free.
let app: Awaited<ReturnType<typeof createApi>>;
let base = '';
let ledger: LedgerService;
let categoryId = '';
let locationId = '';
const codes = new Map<string, string>();
const PASSWORD = 'Synthetic fixture password 42';

beforeAll(async () => {
  const url = process.env.UNLOCK_TEST_DATABASE_URL;
  if (
    process.env.NODE_ENV !== 'test' ||
    !url ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname)
  )
    throw new Error('Isolated database required.');
  app = await createApi({
    databaseUrl: url,
    mode: 'local',
    emailProvider: {
      async sendCode(email, code) {
        codes.set(email, code);
      },
    },
    bidOptions: { enabled: true, prefix: `test:unlock:${randomUUID()}:` },
  });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  ledger = new LedgerService(url);
  categoryId = (
    await ledger.db.category.create({
      data: { name: `Unlock ${randomUUID().slice(0, 8)}`, slug: randomUUID() },
    })
  ).id;
  locationId = (
    await ledger.db.location.create({
      data: {
        name: `Ikeja ${randomUUID().slice(0, 8)}`,
        code: randomUUID().slice(0, 20),
        address: 'Test only',
        hours: {},
        capacityPerSlot: 10,
      },
    })
  ).id;
});
afterAll(async () => {
  await ledger?.close();
  await app?.close();
});

/** A buyer signed in through the real sign-in, with ₦100,000. */
async function buyer(authenticator = false) {
  const email = `unlock-${randomUUID()}@example.test`;
  const user = await ledger.db.user.create({
    data: {
      name: 'Adaeze Okafor',
      buyerPasswordHash: await hashStaffPassword(PASSWORD),
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
      emailVerifiedAt: new Date(),
    },
  });
  const secret = newTotpSecret();
  const wallet = await ledger.openWallet(user.id);
  await ledger.topup({
    walletId: wallet.id,
    amountKobo: 10_000_000n,
    idempotencyKey: randomUUID(),
    reference: randomUUID(),
  });
  const deviceId = randomUUID();
  const session = await signIn(user.id, deviceId);
  if (authenticator) {
    await ledger.db.buyerAuthenticator.create({
      data: {
        userId: user.id,
        secretCiphertext: encryptPii(secret, 'buyer-totp'),
      },
    });
    // Turned on in this sign-in's own settings, so the sign-in stays valid.
    const version = (
      await ledger.db.user.update({
        where: { id: user.id },
        data: {
          authenticatorEnabled: true,
          authenticatorVersion: { increment: 1 },
        },
      })
    ).authenticatorVersion;
    await ledger.db.authSession.updateMany({
      where: { userId: user.id },
      data: { authenticatorVersion: version },
    });
  }
  const credentials = { accessToken: session.accessToken, deviceId };
  return {
    userId: user.id,
    walletId: wallet.id,
    email,
    secret,
    sessionId: session.id,
    refreshToken: session.refreshToken,
    credentials,
    unlock: createPurchaseUnlockClient(base, credentials),
    bids: createBidClient(base, credentials),
    purchases: createPurchaseClient(base, credentials),
  };
}
type Buyer = Awaited<ReturnType<typeof buyer>>;
/** A signed-in buyer session on one device, as the sign-in creates it. */
async function signIn(userId: string, deviceId: string) {
  const accessToken = randomBytes(32).toString('base64url');
  const refreshToken = randomBytes(32).toString('base64url');
  const row = await ledger.db.authSession.create({
    data: {
      userId,
      client: 'mobile',
      buyerMfa: true,
      familyId: randomUUID(),
      deviceHash: hashPii(`mobile:${deviceId}`, 'auth-device'),
      accessHash: hashPii(accessToken, 'auth-token'),
      refreshHash: hashPii(refreshToken, 'auth-token'),
      accessExpiresAt: new Date(Date.now() + 900_000),
      expiresAt: new Date(Date.now() + 900_000),
    },
  });
  return { id: row.id, accessToken, refreshToken };
}
async function lot(fixedPriceKobo?: bigint) {
  return ledger.db.lot.create({
    data: {
      title: 'Binatone blender',
      description: 'Fixture',
      condition: 'open_box',
      retailPriceKobo: 2_000_000n,
      startPriceKobo: 50_000n,
      ...(fixedPriceKobo ? { fixedPriceKobo } : {}),
      categoryId,
      locationId,
      status: 'open',
      startAt: new Date(Date.now() - 10_000),
      endAt: new Date(Date.now() + 3_600_000),
    },
  });
}
const balances = (who: Buyer) => ledger.balances(who.walletId);
/** Password, then the emailed code (and authenticator when given). */
async function confirm(who: Buyer, factor?: string) {
  codes.delete(who.email);
  const asked = await who.unlock.start({ password: PASSWORD });
  const code = codes.get(who.email);
  if (!code) throw new Error('Missing confirmation code.');
  return who.unlock.finish({
    id: asked.id,
    code,
    ...(factor ? { factor: { method: 'authenticator', code: factor } } : {}),
  });
}
const bid = (who: Buyer, lotId: string) =>
  who.bids.prepare(lotId, { maxKobo: 100_000, idempotencyKey: randomUUID() });
function buyNow(who: Buyer, lotId: string) {
  const q = calculateFixedPrice(1_000_000);
  return who.purchases.start(lotId, {
    method: 'wallet',
    idempotencyKey: randomUUID(),
    acceptedPriceKobo: q.priceKobo,
    acceptedTaxKobo: q.taxKobo,
    acceptedProcessingFeeKobo: 0,
    acceptedTotalKobo: q.totalKobo,
  });
}
const locked = { status: 403, code: 'PURCHASE_UNLOCK_REQUIRED' };

describe('before confirming', () => {
  it('refuses bids and Buy Now, and reserves nothing', async () => {
    const who = await buyer();
    const before = await balances(who);
    expect((await who.unlock.status()).unlockedUntil).toBeNull();
    await expect(bid(who, (await lot()).id)).rejects.toMatchObject(locked);
    await expect(buyNow(who, (await lot(1_000_000n)).id)).rejects.toMatchObject(
      locked,
    );
    expect(await balances(who)).toEqual(before);
    expect(
      await ledger.db.bidFundingIntent.count({ where: { userId: who.userId } }),
    ).toBe(0);
    expect(
      await ledger.db.purchase.count({ where: { userId: who.userId } }),
    ).toBe(0);
  });
});

describe('the check', () => {
  it('refuses a wrong password and sends no code', async () => {
    const who = await buyer();
    codes.delete(who.email);
    await expect(
      who.unlock.start({ password: 'Not the password 42' }),
    ).rejects.toMatchObject({ status: 400, field: 'password' });
    expect(codes.has(who.email)).toBe(false);
  });

  it('counts wrong codes and stops the code after five', async () => {
    const who = await buyer();
    codes.delete(who.email);
    const asked = await who.unlock.start({ password: PASSWORD });
    const right = codes.get(who.email) ?? '';
    const wrong = right === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++)
      await expect(
        who.unlock.finish({ id: asked.id, code: wrong }),
      ).rejects.toMatchObject({ status: 400, field: 'code' });
    // Even the right code is refused now.
    await expect(
      who.unlock.finish({ id: asked.id, code: right }),
    ).rejects.toMatchObject({ status: 409, field: 'form' });
    expect((await who.unlock.status()).unlockedUntil).toBeNull();
  });

  it('refuses an expired code and an older code once a new one is sent', async () => {
    const who = await buyer();
    codes.delete(who.email);
    const first = await who.unlock.start({ password: PASSWORD });
    const firstCode = codes.get(who.email) ?? '';
    await who.unlock.start({ password: PASSWORD });
    await expect(
      who.unlock.finish({ id: first.id, code: firstCode }),
    ).rejects.toMatchObject({ status: 409 });
    codes.delete(who.email);
    const late = await who.unlock.start({ password: PASSWORD });
    await ledger.db.accountSecurityChallenge.update({
      where: { id: late.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(
      who.unlock.finish({ id: late.id, code: codes.get(who.email) ?? '' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('needs the authenticator when it is on, and each code works once', async () => {
    const who = await buyer(true);
    codes.delete(who.email);
    const asked = await who.unlock.start({ password: PASSWORD });
    expect(asked.authenticator).toBe(true);
    const code = codes.get(who.email) ?? '';
    await expect(
      who.unlock.finish({ id: asked.id, code }),
    ).rejects.toMatchObject({ status: 422, code: 'TWO_FACTOR_REQUIRED' });
    await expect(
      who.unlock.finish({
        id: asked.id,
        code,
        factor: { method: 'authenticator', code: '000000' },
      }),
    ).rejects.toMatchObject({ status: 422, code: 'TWO_FACTOR_INVALID' });
    const now = totpCode(who.secret, Math.floor(Date.now() / 30_000));
    await who.unlock.finish({
      id: asked.id,
      code,
      factor: { method: 'authenticator', code: now },
    });
    expect((await who.unlock.status()).unlockedUntil).not.toBeNull();
    // The same authenticator code can't confirm a second time.
    await expect(confirm(who, now)).rejects.toMatchObject({ status: 422 });
  });

  it('confirms once when the same code is sent twice at once', async () => {
    const who = await buyer();
    codes.delete(who.email);
    const asked = await who.unlock.start({ password: PASSWORD });
    const code = codes.get(who.email) ?? '';
    const results = await Promise.allSettled([
      who.unlock.finish({ id: asked.id, code }),
      who.unlock.finish({ id: asked.id, code }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('keeps its codes away from the security settings page', async () => {
    const who = await buyer();
    codes.delete(who.email);
    const asked = await who.unlock.start({ password: PASSWORD });
    const session = await ledger.db.accountSecurityChallenge.findUniqueOrThrow({
      where: { id: asked.id },
    });
    const response = await fetch(`${base}/auth/security/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${who.credentials.accessToken}`,
        'x-device-id': who.credentials.deviceId,
      },
      body: JSON.stringify({ id: session.id, code: codes.get(who.email) }),
    });
    expect(response.ok).toBe(false);
    expect(
      (
        await ledger.db.accountSecurityChallenge.findUniqueOrThrow({
          where: { id: asked.id },
        })
      ).emailVerifiedAt,
    ).toBeNull();
  });
});

describe('after confirming', () => {
  it('bids and buys for 30 minutes, and each bid restarts the 30 minutes', async () => {
    const who = await buyer();
    const started = Date.now();
    const { unlockedUntil } = await confirm(who);
    const until = Date.parse(unlockedUntil ?? '');
    expect(until - started).toBeGreaterThanOrEqual(PURCHASE_UNLOCK_MS - 5000);
    expect(until - started).toBeLessThanOrEqual(PURCHASE_UNLOCK_MS + 5000);
    const item = await lot();
    const before = await balances(who);
    const proof = await bid(who, item.id);
    expect((await balances(who)).heldKobo).toBe(
      before.heldKobo + BigInt(estimatedTotal(100_000)),
    );
    // Pretend 25 minutes passed: the next bid moves the end forward again.
    await ledger.db.authSession.updateMany({
      where: { userId: who.userId },
      data: { purchaseUnlockedUntil: new Date(Date.now() + 5 * 60_000) },
    });
    await buyNow(who, (await lot(1_000_000n)).id);
    expect(
      Date.parse((await who.unlock.status()).unlockedUntil ?? ''),
    ).toBeGreaterThan(Date.now() + PURCHASE_UNLOCK_MS - 60_000);
    await who.bids.cancel(proof.preparationId);
  });

  it('asks again after 30 idle minutes, and a retry of an earlier bid still works', async () => {
    const who = await buyer();
    await confirm(who);
    const item = await lot();
    const key = randomUUID();
    const first = await who.bids.prepare(item.id, {
      maxKobo: 100_000,
      idempotencyKey: key,
    });
    await ledger.db.authSession.updateMany({
      where: { userId: who.userId },
      data: { purchaseUnlockedUntil: new Date(Date.now() - 1000) },
    });
    // The same request, retried after a dropped connection, isn't a new bid.
    expect(
      (
        await who.bids.prepare(item.id, {
          maxKobo: 100_000,
          idempotencyKey: key,
        })
      ).preparationId,
    ).toBe(first.preparationId);
    const before = await balances(who);
    await expect(bid(who, (await lot()).id)).rejects.toMatchObject(locked);
    expect(await balances(who)).toEqual(before);
    await who.bids.cancel(first.preparationId);
  });

  it('survives the routine token refresh, even between the two steps', async () => {
    const who = await buyer();
    const auth = createAuthClient(base, {
      client: 'mobile',
      deviceId: who.credentials.deviceId,
    });
    // Started before a refresh, finished after it.
    codes.delete(who.email);
    const asked = await who.unlock.start({ password: PASSWORD });
    const first = await auth.refresh(who.refreshToken);
    const after = createPurchaseUnlockClient(base, {
      accessToken: first.accessToken,
      deviceId: who.credentials.deviceId,
    });
    await after.finish({ id: asked.id, code: codes.get(who.email) ?? '' });
    // Confirmed, then refreshed again: bidding still works without asking.
    const second = await auth.refresh(first.refreshToken);
    const bids = createBidClient(base, {
      accessToken: second.accessToken,
      deviceId: who.credentials.deviceId,
    });
    const proof = await bids.prepare((await lot()).id, {
      maxKobo: 100_000,
      idempotencyKey: randomUUID(),
    });
    await bids.cancel(proof.preparationId);
  });

  it('belongs to one sign-in: another device must confirm, and signing out ends it', async () => {
    const who = await buyer();
    await confirm(who);
    const device = randomUUID();
    const second = await signIn(who.userId, device);
    const elsewhere = createBidClient(base, {
      accessToken: second.accessToken,
      deviceId: device,
    });
    await expect(
      elsewhere.prepare((await lot()).id, {
        maxKobo: 100_000,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject(locked);
    // The first device still can, until it signs out.
    const proof = await bid(who, (await lot()).id);
    await who.bids.cancel(proof.preparationId);
    // Signing out ends the sign-in, and its confirmation with it.
    await createAuthClient(base, {
      client: 'mobile',
      deviceId: who.credentials.deviceId,
    }).logout(who.refreshToken);
    const before = await balances(who);
    await expect(bid(who, (await lot()).id)).rejects.toMatchObject({
      status: 401,
    });
    expect(await balances(who)).toEqual(before);
  });
});
