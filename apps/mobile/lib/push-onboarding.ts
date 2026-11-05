export const pushPromptKey = 'auction-ng.push-permission-prompted.v1';
export const pushPermissionConsentKey = 'auction-ng.push-permission-consent.v1';
export const pushOptInKey = (owner: string) =>
  'auction-ng.push-opt-in.' + owner;
type Permission = { status: string; canAskAgain: boolean };
export function createPushPermissionOnboarding(options: {
  read: (key: string) => Promise<string | null>;
  write: (key: string, value: string) => Promise<void>;
  permission: () => Promise<Permission>;
  prepare: () => Promise<void>;
  request: () => Promise<Permission>;
}) {
  let pending: Promise<void> | undefined;
  return () => {
    pending ??= (async () => {
      if ((await options.read(pushPromptKey)) === 'true') return;
      const current = await options.permission();
      if (current.status === 'granted') {
        await options.prepare();
        await options.write(pushPermissionConsentKey, 'true');
        await options.write(pushPromptKey, 'true');
        return;
      }
      // Persist before opening the OS dialog so restarts cannot repeatedly prompt.
      await options.write(pushPromptKey, 'true');
      if (current.status !== 'undetermined' || !current.canAskAgain) return;
      await options.prepare();
      const result = await options.request();
      await options.write(
        pushPermissionConsentKey,
        String(result.status === 'granted'),
      );
    })();
    return pending;
  };
}
export function shouldAutoRegisterPush(
  accountChoice: string | null,
  deviceConsent: string | null,
) {
  return (
    accountChoice === 'true' ||
    (accountChoice === null && deviceConsent === 'true')
  );
}
