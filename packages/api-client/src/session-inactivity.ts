import {
  buyerSessionRules,
  type BuyerSessionState,
} from '@auction-ng/shared/buyer-session';
import { ApiError } from './auth';

export type BuyerInactivityState = {
  seconds: number;
  busy: boolean;
  error: string;
  canContinue: boolean;
};
/** Web and native share a deadline controller; only the API can extend time. */
export function createBuyerInactivity(options: {
  read(activity: boolean): Promise<BuyerSessionState>;
  expired(): void;
  update(state: BuyerInactivityState): void;
  now?: () => number;
  initialState?: BuyerSessionState;
}) {
  const now = options.now ?? Date.now;
  let deadline = now() + buyerSessionRules.idleMs,
    absolute = Infinity,
    alive = true,
    ended = false,
    pending = false,
    queued = false,
    queuedActivity = false,
    lastSent = -Infinity,
    busy = false,
    error = '';
  if (options.initialState) {
    const initial = options.initialState;
    deadline =
      now() +
      Date.parse(initial.idleExpiresAt) -
      Date.parse(initial.serverTime);
    absolute =
      now() + Date.parse(initial.expiresAt) - Date.parse(initial.serverTime);
  }
  const remaining = () => Math.min(deadline, absolute) - now();
  const emit = () => {
    if (alive && !ended)
      options.update({
        seconds: Math.max(0, Math.ceil(remaining() / 1000)),
        busy,
        error,
        canContinue: absolute - now() > buyerSessionRules.warningMs,
      });
  };
  const expire = () => {
    if (!alive || ended) return;
    ended = true;
    options.expired();
  };
  const sync = async (activity = false): Promise<void> => {
    if (!alive || ended) return;
    if (remaining() <= 0) {
      expire();
      return;
    }
    if (pending) {
      queued = true;
      queuedActivity ||= activity;
      return;
    }
    pending = true;
    busy = activity;
    emit();
    const sentAt = now();
    try {
      const state = await options.read(activity);
      if (!alive || ended) return;
      deadline =
        sentAt + Date.parse(state.idleExpiresAt) - Date.parse(state.serverTime);
      absolute =
        sentAt + Date.parse(state.expiresAt) - Date.parse(state.serverTime);
      error = '';
      if (remaining() <= 0) expire();
    } catch (cause) {
      if (!alive || ended) return;
      if (cause instanceof ApiError && [401, 403].includes(cause.status))
        expire();
      else if (activity)
        error =
          'We could not keep you signed in. Check your connection and try again before the timer ends.';
    } finally {
      pending = false;
      busy = false;
      emit();
      if (alive && !ended && queued) {
        const activity = queuedActivity;
        queued = false;
        queuedActivity = false;
        await sync(activity);
      }
    }
  };
  return {
    sync,
    async interact() {
      if (
        remaining() <= buyerSessionRules.warningMs ||
        now() - lastSent < buyerSessionRules.activityIntervalMs
      )
        return;
      lastSent = now();
      await sync(true);
    },
    tick() {
      if (remaining() <= 0) expire();
      else emit();
    },
    dismissError() {
      error = '';
      emit();
    },
    dispose() {
      alive = false;
    },
  };
}
