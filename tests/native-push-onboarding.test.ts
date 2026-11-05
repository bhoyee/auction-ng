import { expect, it, vi } from 'vitest';
import {
  createPushPermissionOnboarding,
  pushPromptKey,
  pushPermissionConsentKey,
  shouldAutoRegisterPush,
} from '../apps/mobile/lib/push-onboarding';
function fixture(status = 'undetermined', canAskAgain = true) {
  const values = new Map<string, string>();
  const permission = vi.fn(async () => ({ status, canAskAgain }));
  const prepare = vi.fn(async () => {});
  const request = vi.fn(async () => ({ status: 'granted', canAskAgain: true }));
  const run = createPushPermissionOnboarding({
    read: async (key) => values.get(key) ?? null,
    write: async (key, value) => {
      values.set(key, value);
    },
    permission,
    prepare,
    request,
  });
  return { values, permission, prepare, request, run };
}
it('asks once after preparing the channel and records consent only after grant', async () => {
  const f = fixture();
  f.request.mockImplementation(async () => {
    expect(f.prepare).toHaveBeenCalledOnce();
    expect(f.values.get(pushPromptKey)).toBe('true');
    expect(f.values.get(pushPermissionConsentKey)).toBeUndefined();
    return { status: 'granted', canAskAgain: true };
  });
  await Promise.all([f.run(), f.run(), f.run()]);
  expect(f.request).toHaveBeenCalledOnce();
  expect(f.values.get(pushPermissionConsentKey)).toBe('true');
});
it('does not repeat a saved prompt on another app launch', async () => {
  const f = fixture();
  f.values.set(pushPromptKey, 'true');
  await f.run();
  expect(f.permission).not.toHaveBeenCalled();
  expect(f.request).not.toHaveBeenCalled();
});
it('does not request already granted permission', async () => {
  const f = fixture('granted');
  await f.run();
  expect(f.request).not.toHaveBeenCalled();
  expect(f.values.get(pushPermissionConsentKey)).toBe('true');
});
it.each([
  ['denied', true],
  ['denied', false],
  ['undetermined', false],
])('respects %s permission with canAskAgain=%s', async (status, ask) => {
  const f = fixture(status, ask);
  await f.run();
  expect(f.request).not.toHaveBeenCalled();
  expect(f.values.get(pushPermissionConsentKey)).not.toBe('true');
});
it('does not opt in when the user denies the first request', async () => {
  const f = fixture();
  f.request.mockResolvedValue({ status: 'denied', canAskAgain: false });
  await f.run();
  expect(f.values.get(pushPermissionConsentKey)).toBe('false');
});
it('preserves explicit account opt-outs even with device permission', () => {
  expect(shouldAutoRegisterPush('false', 'true')).toBe(false);
  expect(shouldAutoRegisterPush(null, 'true')).toBe(true);
  expect(shouldAutoRegisterPush(null, 'false')).toBe(false);
  expect(shouldAutoRegisterPush('true', null)).toBe(true);
});
