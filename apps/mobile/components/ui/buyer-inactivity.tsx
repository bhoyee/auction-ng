import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { buyerSessionRules } from '@auction-ng/shared/buyer-session';
import {
  createBuyerInactivity,
  type BuyerInactivityState,
} from '@auction-ng/api-client/session-inactivity';
import { useSession } from '../../lib/session';
import { observeBuyerInteraction } from '../../lib/session-interaction';
import { Body, Button, Dialog, Stack } from './controls';
import { Notice } from './page';

export function NativeBuyerInactivity() {
  const { session, manager, sessionExpired } = useSession();
  const owner = session?.user.id;
  const router = useRouter();
  const monitor = useRef<ReturnType<typeof createBuyerInactivity> | undefined>(
    undefined,
  );
  const [state, setState] = useState<BuyerInactivityState>({
    seconds: buyerSessionRules.idleMs / 1000,
    busy: false,
    error: '',
    canContinue: true,
  });
  const [logoutError, setLogoutError] = useState('');
  useEffect(() => {
    if (sessionExpired && !session) router.replace('/sign-in?expired=1');
  }, [sessionExpired, session, router]);
  useEffect(() => {
    if (!owner) return;
    const check = createBuyerInactivity({
      initialState: manager.session?.sessionState,
      update: setState,
      read: (activity) =>
        manager.run(
          (c) => manager.auth.session(c.accessToken, activity),
          owner,
        ),
      expired: () => {
        void manager.invalidate().catch(() => {});
      },
    });
    monitor.current = check;
    const stop = observeBuyerInteraction(() => {
      if (AppState.currentState === 'active') void check.interact();
    });
    const listener = AppState.addEventListener('change', (value) => {
      if (value === 'active') {
        check.tick();
        void check.sync();
      }
    });
    const timer = setInterval(() => check.tick(), 1000);
    const poll = setInterval(() => {
      if (AppState.currentState === 'active') void check.sync();
    }, buyerSessionRules.checkIntervalMs);
    void check.sync();
    return () => {
      check.dispose();
      stop();
      listener.remove();
      clearInterval(timer);
      clearInterval(poll);
    };
  }, [owner, manager]);
  return (
    <Dialog
      open={!!owner && state.seconds <= buyerSessionRules.warningMs / 1000}
      title="Are you still there?"
      onClose={() => {
        void manager
          .logout()
          .then(() => router.replace('/sign-in'))
          .catch(() =>
            setLogoutError(
              'We could not sign you out. Check your connection and retry.',
            ),
          );
      }}
    >
      <Stack>
        <Body>
          To protect your wallet and account, we sign you out after 15 minutes
          of inactivity.
        </Body>
        <Body accessibilityLiveRegion="polite">
          Your session ends in {state.seconds} seconds.
        </Body>
        <Notice
          message={logoutError || state.error}
          onClose={() => {
            setLogoutError('');
            monitor.current?.dismissError();
          }}
        />
        {state.canContinue && (
          <Button
            busy={state.busy}
            onPress={() => {
              setLogoutError('');
              void monitor.current?.sync(true);
            }}
          >
            Stay signed in
          </Button>
        )}
        <Button
          variant="danger"
          onPress={() => {
            void manager
              .logout()
              .then(() => router.replace('/sign-in'))
              .catch(() =>
                setLogoutError(
                  'We could not sign you out. Check your connection and retry.',
                ),
              );
          }}
        >
          Sign out
        </Button>
      </Stack>
    </Dialog>
  );
}
