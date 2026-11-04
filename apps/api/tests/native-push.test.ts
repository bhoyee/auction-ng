import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { LedgerService } from '../src/ledger/ledger-service';
import { NativePushService } from '../src/native-push/native-push-service';
import { encryptPii, hashPii } from '../src/security/pii';
import type { AuthIdentity } from '../src/auth/auth-service';
let ledger: LedgerService, service: NativePushService;
const send = vi.fn(async () => ({ id: randomUUID(), status: 'ok' as const }));
beforeAll(() => {
  const url =
    process.env.NATIVE_PUSH_TEST_DATABASE_URL ??
    process.env.AUTH_TEST_DATABASE_URL;
  if (!url || !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname))
    throw Error('Isolated native push test database required.');
  ledger = new LedgerService(url);
  service = new NativePushService(ledger, send);
});
afterAll(async () => ledger?.close());
async function buyer(client = 'mobile') {
  const email = randomUUID() + '@example.test';
  const user = await ledger.db.user.create({
    data: {
      name: 'Synthetic mobile buyer',
      emailVerifiedAt: new Date(),
      emailHash: hashPii(email, 'email'),
      emailCiphertext: encryptPii(email, 'email'),
    },
  });
  const session = await ledger.db.authSession.create({
    data: {
      userId: user.id,
      familyId: randomUUID(),
      deviceHash: '0'.repeat(64),
      client,
      buyerMfa: true,
      accessHash: randomUUID().padEnd(64, '0'),
      refreshHash: randomUUID().padEnd(64, '0'),
      accessExpiresAt: new Date(Date.now() + 900000),
      expiresAt: new Date(Date.now() + 900000),
    },
  });
  const identity = {
    user: { id: user.id, role: 'buyer', status: 'active', emailVerified: true },
    sessionId: session.id,
  } as AuthIdentity;
  return { identity, user, session };
}
async function notify(userId: string) {
  return ledger.db.notification.create({
    data: {
      userId,
      channel: 'email',
      template: 'outbid-v1',
      payloadCiphertext: encryptPii('{}', 'notification'),
    },
  });
}
it('registers only active mobile buyer sessions and encrypts tokens', async () => {
  const a = await buyer(),
    web = await buyer('web');
  const token = 'ExponentPushToken[' + randomUUID() + ']';
  await expect(
    service.register(web.identity, { token, platform: 'android' }),
  ).rejects.toMatchObject({ status: 403 });
  await service.register(a.identity, { token, platform: 'android' });
  const row = await ledger.db.nativePushDevice.findUniqueOrThrow({
    where: { tokenHash: hashPii(token, 'native-push-token') },
  });
  expect(row.userId).toBe(a.user.id);
  expect(Buffer.from(row.tokenCiphertext).toString()).not.toContain(token);
  expect(await service.disable(a.identity)).toEqual({ enabled: false });
});
it('delivers a notification once across concurrent delivery attempts and stops after revocation', async () => {
  const a = await buyer();
  await service.register(a.identity, {
    token: 'ExponentPushToken[' + randomUUID() + ']',
    platform: 'android',
  });
  await notify(a.user.id);
  send.mockClear();
  await Promise.all([service.deliver(), service.deliver(), service.deliver()]);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]).toBeDefined();
  await ledger.db.authSession.update({
    where: { id: a.session.id },
    data: { revokedAt: new Date() },
  });
  await notify(a.user.id);
  await service.deliver();
  expect(send).toHaveBeenCalledTimes(1);
});
it('does not replay older account notifications to a newly registered shared phone', async () => {
  const a = await buyer(),
    b = await buyer();
  const token = 'ExponentPushToken[' + randomUUID() + ']';
  await notify(b.user.id);
  await service.register(a.identity, { token, platform: 'android' });
  await service.register(b.identity, { token, platform: 'android' });
  send.mockClear();
  await service.deliver();
  expect(send).not.toHaveBeenCalled();
  await notify(b.user.id);
  await service.deliver();
  expect(send).toHaveBeenCalledTimes(1);
});
