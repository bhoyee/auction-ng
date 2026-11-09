import { beforeAll, afterAll, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { calculateFixedPrice, BID_FEE_VERSION } from '@auction-ng/shared';
import { AuthService } from '../src/auth/auth-service';
import { ActionVerificationService } from '../src/auth/action-verification-service';
import {
  hashStaffPassword,
  newTotpSecret,
  totpCode,
} from '../src/auth/staff-crypto';
import { LedgerService } from '../src/ledger/ledger-service';
import { BidService } from '../src/bids/bid-service';
import { PurchaseService } from '../src/purchases/purchase-service';
import { encryptPii, hashPii } from '../src/security/pii';
import { createStaffSignIn } from './staff-sign-in-helper';

// MONEY/BID CHANGE coverage: password + email code (+ authenticator) before
// bidding (30-minute window), Buy Now (single use) and staff sign-in.
let ledger: LedgerService, bids: BidService, purchases: PurchaseService;
let auth: AuthService, verification: ActionVerificationService;
let categoryId: string, locationId: string;
const clock = Date.now();
const inbox = new Map<string, string>();
const password = 'Synthetic buyer passphrase 42';
const staffSignIn = createStaffSignIn(
  () => auth,
  () => inbox,
);

beforeAll(async () => {
  const url = process.env.ACTION_VERIFICATION_TEST_DATABASE_URL;
  if (
    process.env.NODE_ENV !== 'test' ||
    !url ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname)
  )
    throw new Error('Isolated action verification database required.');
  ledger = new LedgerService(url);
  bids = new BidService(ledger, {
    enabled: true,
    prefix: `test:verify:${randomUUID()}:`,
  });
  await bids.start();
  purchases = new PurchaseService(ledger, bids);
  auth = new AuthService({
    databaseUrl: url,
    mode: 'local',
    now: () => clock,
    emailProvider: {
      async sendCode(email, code) {
        inbox.set(email, code);
      },
    },
  });
  verification = new ActionVerificationService(auth);
  categoryId = (
    await ledger.db.category.create({
      data: { name: 'Verification fixtures', slug: randomUUID() },
    })
  ).id;
  locationId = (
    await ledger.db.location.create({
      data: {
        name: 'Synthetic Ikeja hub',
        code: randomUUID().slice(0, 20),
        address: 'Test only',
        hours: {},
        capacityPerSlot: 10,
      },
    })
  ).id;
});
afterAll(async () => {
  await bids?.close();
  await auth?.close();
  await ledger?.close();
});

async function buyer(options: { totp?: boolean } = {}) {
  const email = `${randomUUID()}@example.test`;
  const secret = newTotpSecret();
  const user = await ledger.db.user.create({
    data: {
      name: 'Synthetic buyer',
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
      emailVerifiedAt: new Date(),
      buyerPasswordHash: await hashStaffPassword(password),
      authenticatorEnabled: !!options.totp,
      ...(options.totp
        ? {
            buyerAuthenticator: {
              create: {
                secretCiphertext: encryptPii(secret, 'buyer-totp'),
              },
            },
          }
        : {}),
    },
  });
  const wallet = await ledger.openWallet(user.id);
  await ledger.topup({
    walletId: wallet.id,
    amountKobo: 20000000n,
    idempotencyKey: randomUUID(),
    reference: randomUUID(),
  });
  return { user, email, secret, ...(await session(user.id)) };
}
async function session(userId: string) {
  const token = randomBytes(32).toString('base64url'),
    device = randomUUID();
  const row = await ledger.db.authSession.create({
    data: {
      buyerMfa: true,
      userId,
      familyId: randomUUID(),
      deviceHash: hashPii(`web:${device}`, 'auth-device'),
      client: 'web',
      accessHash: hashPii(token, 'auth-token'),
      refreshHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
      accessExpiresAt: new Date(Date.now() + 3600000),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const identity = await auth.authenticate(token, device);
  return {
    token,
    device,
    identity,
    who: { userId, sessionId: row.id },
  };
}
async function lot(fixed = false) {
  return ledger.db.lot.create({
    data: {
      title: 'Synthetic verification lot',
      lotNumber: `VER-${randomUUID().slice(0, 28)}`,
      description: 'Fixture',
      condition: 'open_box',
      retailPriceKobo: 2000000n,
      startPriceKobo: 50000n,
      ...(fixed ? { fixedPriceKobo: 1000000n } : {}),
      categoryId,
      locationId,
      status: 'open',
      startAt: new Date(Date.now() - 10000),
      endAt: new Date(Date.now() + 3600000),
    },
  });
}
const code = (email: string) => {
  const value = inbox.get(email);
  if (!value) throw new Error('No code sent');
  return value;
};
const wrong = (value: string) => (value === '000000' ? '111111' : '000000');
function prepare(
  b: Awaited<ReturnType<typeof buyer>>,
  lotId: string,
  key = randomUUID(),
) {
  return bids.prepare(
    b.who,
    lotId,
    {
      maxKobo: 60000,
      mode: 'direct',
      idempotencyKey: key,
      feeVersion: BID_FEE_VERSION,
    },
    b.token,
    b.device,
  );
}
function purchaseInput(verificationId: string) {
  const q = calculateFixedPrice(1000000);
  return {
    idempotencyKey: randomUUID(),
    verificationId,
    method: 'wallet' as const,
    acceptedPriceKobo: q.priceKobo,
    acceptedTaxKobo: q.taxKobo,
    acceptedProcessingFeeKobo: 0,
    acceptedTotalKobo: q.totalKobo,
  };
}
async function verify(
  b: Awaited<ReturnType<typeof buyer>>,
  purpose: 'bidding' | 'buy-now' | 'bid-cancellation',
  lotId?: string,
) {
  const challenge = await verification.start(
    b.identity,
    { purpose, password, ...(lotId ? { lotId } : {}) },
    randomUUID(),
  );
  return verification.finish(
    b.identity,
    { id: challenge.id, code: code(b.email) },
    randomUUID(),
  );
}

it('refuses a new bid reservation until the buyer completes the check, then allows bids for 30 minutes', async () => {
  const b = await buyer(),
    item = await lot();
  await expect(prepare(b, item.id)).rejects.toMatchObject({
    status: 403,
    response: { code: 'VERIFICATION_REQUIRED', purpose: 'bidding' },
  });
  expect(
    await ledger.db.bidFundingIntent.count({ where: { userId: b.user.id } }),
  ).toBe(0);
  await expect(
    verification.start(
      b.identity,
      { purpose: 'bidding', password: 'not my password' },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 401 });
  const challenge = await verification.start(
    b.identity,
    { purpose: 'bidding', password },
    randomUUID(),
  );
  expect(challenge.twoFactorRequired).toBe(false);
  await expect(
    verification.finish(
      b.identity,
      { id: challenge.id, code: wrong(code(b.email)) },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 400 });
  const result = await verification.finish(
    b.identity,
    { id: challenge.id, code: code(b.email) },
    randomUUID(),
  );
  expect(result.verificationId).toBeNull();
  const until = Date.parse(result.biddingVerifiedUntil ?? '');
  expect(until - clock).toBe(30 * 60 * 1000);
  expect((await verification.status(b.identity)).biddingVerifiedUntil).toBe(
    result.biddingVerifiedUntil,
  );
  // The bidding check cannot be finished twice.
  await expect(
    verification.finish(
      b.identity,
      { id: challenge.id, code: code(b.email) },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 400 });
  await expect(prepare(b, item.id)).resolves.toMatchObject({
    totalKobo: expect.any(Number),
  });
  // Another device or session of the same buyer is not unlocked.
  const other = await session(b.user.id);
  await expect(prepare({ ...b, ...other }, item.id)).rejects.toMatchObject({
    status: 403,
  });
  // When the window closes, new reservations need a fresh check, but an exact
  // replay of an existing preparation still returns the original.
  const key = randomUUID();
  const keptLot = await lot();
  await prepare(b, keptLot.id, key);
  await ledger.db.authSession.update({
    where: { id: b.who.sessionId },
    data: { bidVerifiedUntil: new Date(Date.now() - 1000) },
  });
  await expect(prepare(b, item.id)).rejects.toMatchObject({ status: 403 });
  await expect(
    bids.prepare(
      b.who,
      keptLot.id,
      {
        maxKobo: 60000,
        mode: 'direct',
        idempotencyKey: key,
        feeVersion: BID_FEE_VERSION,
      },
      b.token,
      b.device,
    ),
  ).resolves.toBeDefined();
});

it('locks a check after five wrong email codes and rejects a check from another session', async () => {
  const b = await buyer();
  const challenge = await verification.start(
    b.identity,
    { purpose: 'bidding', password },
    randomUUID(),
  );
  const right = code(b.email);
  for (let i = 0; i < 5; i++)
    await expect(
      verification.finish(
        b.identity,
        { id: challenge.id, code: wrong(right) },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 400 });
  await expect(
    verification.finish(
      b.identity,
      { id: challenge.id, code: right },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 400 });
  const fresh = await verification.start(
    b.identity,
    { purpose: 'bidding', password },
    randomUUID(),
  );
  const other = await session(b.user.id);
  await expect(
    verification.finish(
      other.identity,
      { id: fresh.id, code: code(b.email) },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 400 });
});

it('requires the authenticator when 2FA is on and refuses a reused code', async () => {
  const b = await buyer({ totp: true });
  const first = await verification.start(
    b.identity,
    { purpose: 'bidding', password },
    randomUUID(),
  );
  expect(first.twoFactorRequired).toBe(true);
  await expect(
    verification.finish(
      b.identity,
      { id: first.id, code: code(b.email) },
      randomUUID(),
    ),
  ).rejects.toMatchObject({
    status: 422,
    response: { code: 'TWO_FACTOR_REQUIRED' },
  });
  const totp = totpCode(b.secret, Math.floor(clock / 30000));
  await expect(
    verification.finish(
      b.identity,
      {
        id: first.id,
        code: code(b.email),
        factor: { method: 'authenticator', code: totp },
      },
      randomUUID(),
    ),
  ).resolves.toMatchObject({ purpose: 'bidding' });
  const second = await verification.start(
    b.identity,
    { purpose: 'bidding', password },
    randomUUID(),
  );
  await expect(
    verification.finish(
      b.identity,
      {
        id: second.id,
        code: code(b.email),
        factor: { method: 'authenticator', code: totp },
      },
      randomUUID(),
    ),
  ).rejects.toMatchObject({
    status: 422,
    response: { code: 'TWO_FACTOR_INVALID' },
  });
});

it('uses a Buy Now proof once, only for its lot, and exactly once under concurrency', async () => {
  const b = await buyer(),
    item = await lot(true),
    otherItem = await lot(true);
  await expect(
    purchases.start(b.who, item.id, purchaseInput(randomUUID())),
  ).rejects.toMatchObject({ status: 403 });
  const wrongLot = await verify(b, 'buy-now', otherItem.id);
  await expect(
    purchases.start(
      b.who,
      item.id,
      purchaseInput(wrongLot.verificationId ?? ''),
    ),
  ).rejects.toMatchObject({ status: 403 });
  const proof = await verify(b, 'buy-now', item.id);
  expect(proof.biddingVerifiedUntil).toBeNull();
  const id = proof.verificationId ?? '';
  const results = await Promise.allSettled([
    purchases.start(b.who, item.id, purchaseInput(id)),
    purchases.start(b.who, item.id, purchaseInput(id)),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(await ledger.db.purchase.count({ where: { lotId: item.id } })).toBe(1);
  const row = await ledger.db.accountSecurityChallenge.findUniqueOrThrow({
    where: { id },
  });
  expect(row.consumedAt).not.toBeNull();
  // A Buy Now proof never unlocks bidding.
  await expect(prepare(b, (await lot()).id)).rejects.toMatchObject({
    status: 403,
  });
});

it('rejects a Buy Now proof once its session is signed out', async () => {
  const b = await buyer(),
    item = await lot(true);
  const proof = await verify(b, 'buy-now', item.id);
  // Sign the session out the way the server does, behind the bid fence.
  await ledger.db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('auction_ng.bid_fenced','on',true)`;
    await tx.authSession.update({
      where: { id: b.who.sessionId },
      data: { revokedAt: new Date() },
    });
  });
  await expect(
    purchases.start(b.who, item.id, purchaseInput(proof.verificationId ?? '')),
  ).rejects.toMatchObject({ status: 403 });
});

it('rejects a Buy Now proof after the buyer changes their password', async () => {
  const b = await buyer(),
    item = await lot(true);
  const proof = await verify(b, 'buy-now', item.id);
  await ledger.db.user.update({
    where: { id: b.user.id },
    data: { buyerPasswordHash: await hashStaffPassword('A new passphrase 99') },
  });
  await expect(
    purchases.start(b.who, item.id, purchaseInput(proof.verificationId ?? '')),
  ).rejects.toMatchObject({ status: 403 });
});

async function staff(totp = false) {
  const email = `${randomUUID()}@example.test`,
    staffPassword = 'Synthetic staff passphrase 4242',
    deviceId = randomUUID(),
    secret = newTotpSecret();
  const user = await ledger.db.user.create({
    data: {
      name: 'Synthetic staff',
      role: 'admin',
      emailVerifiedAt: new Date(),
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
      authenticatorEnabled: totp,
      staffCredential: {
        create: {
          passwordHash: await hashStaffPassword(staffPassword),
          ...(totp
            ? { totpSecretCiphertext: encryptPii(secret, 'staff-totp') }
            : {}),
        },
      },
    },
  });
  return { user, email, password: staffPassword, deviceId, secret };
}

it('signs staff in only after the emailed code, then the authenticator when enabled', async () => {
  const s = await staff();
  const input = {
    email: s.email,
    password: s.password,
    deviceId: s.deviceId,
    client: 'web' as const,
  };
  const challenge = await auth.staffSignIn(input, randomUUID());
  expect(challenge.twoFactorRequired).toBe(false);
  expect(challenge).not.toHaveProperty('accessToken');
  await expect(
    auth.staffSignInVerify(
      {
        challengeId: challenge.challengeId,
        code: code(s.email),
        deviceId: randomUUID(),
        client: 'web',
      },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 401 });
  const tokens = await auth.staffSignInVerify(
    {
      challengeId: challenge.challengeId,
      code: code(s.email),
      deviceId: s.deviceId,
      client: 'web',
    },
    randomUUID(),
  );
  expect(tokens.accessToken).toEqual(expect.any(String));
  // The code is single use.
  await expect(
    auth.staffSignInVerify(
      {
        challengeId: challenge.challengeId,
        code: code(s.email),
        deviceId: s.deviceId,
        client: 'web',
      },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 401 });

  const t = await staff(true);
  const next = await auth.staffSignIn(
    { ...input, email: t.email, password: t.password, deviceId: t.deviceId },
    randomUUID(),
  );
  expect(next.twoFactorRequired).toBe(true);
  await expect(
    auth.staffSignInVerify(
      {
        challengeId: next.challengeId,
        code: code(t.email),
        deviceId: t.deviceId,
        client: 'web',
      },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    staffSignIn(
      {
        email: t.email,
        password: t.password,
        deviceId: t.deviceId,
        client: 'web',
        code: totpCode(t.secret, Math.floor(clock / 30000)),
      },
      randomUUID(),
    ),
  ).resolves.toMatchObject({ user: { id: t.user.id } });
});

it('rejects staff email codes after five wrong guesses or a password change', async () => {
  const s = await staff();
  const input = {
    email: s.email,
    password: s.password,
    deviceId: s.deviceId,
    client: 'web' as const,
  };
  const challenge = await auth.staffSignIn(input, randomUUID());
  const right = code(s.email);
  for (let i = 0; i < 5; i++)
    await expect(
      auth.staffSignInVerify(
        {
          challengeId: challenge.challengeId,
          code: wrong(right),
          deviceId: s.deviceId,
          client: 'web',
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 401 });
  await expect(
    auth.staffSignInVerify(
      {
        challengeId: challenge.challengeId,
        code: right,
        deviceId: s.deviceId,
        client: 'web',
      },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 401 });
  const fresh = await auth.staffSignIn(input, randomUUID());
  await ledger.db.staffCredential.update({
    where: { userId: s.user.id },
    data: {
      passwordHash: await hashStaffPassword('Replaced staff passphrase 77'),
    },
  });
  await expect(
    auth.staffSignInVerify(
      {
        challengeId: fresh.challengeId,
        code: code(s.email),
        deviceId: s.deviceId,
        client: 'web',
      },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 401 });
});
