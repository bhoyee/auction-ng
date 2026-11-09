import { acquireStaffRealtime } from './staff-realtime';
import { StaffLiveClock } from './staff-live-clock';
import {
  monitorJoinSchema,
  monitorPatchSchema,
  monitorSignalSchema,
  type MonitorLot,
} from '@auction-ng/shared';
export function connectStaffLive(
  baseUrl: string,
  credentials: { accessToken: string; deviceId: string },
  callbacks: {
    status: (live: boolean) => void;
    changed: () => void;
    patch: (
      value: Pick<
        MonitorLot,
        'streamId' | 'endsAt' | 'serverTime' | 'leading' | 'currentPriceKobo'
      > & { lotId: string },
    ) => void;
  },
) {
  const connection = acquireStaffRealtime(baseUrl, credentials),
    { socket } = connection;
  const clock = new StaffLiveClock();
  let disposed = false,
    generation = 0;
  let joined = false,
    joining = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const retryJoin = () => {
    if (disposed || !socket.connected || retry) return;
    retry = setTimeout(() => {
      retry = undefined;
      if (!disposed && socket.connected && !joined) void connected();
    }, 2000);
  };
  const lost = () => {
    generation++;
    joined = false;
    joining = false;
    clearTimeout(retry);
    retry = undefined;
    clock.disconnect();
    callbacks.status(false);
  };
  const connected = async () => {
    if (disposed || joining) return;
    joining = true;
    const current = ++generation,
      sent = performance.now();
    try {
      const value = monitorJoinSchema.parse(
        await socket.timeout(5000).emitWithAck('admin:live:subscribe', {}),
      );
      if (disposed || current !== generation) return;
      if (!value.ok) {
        lost();
        retryJoin();
        return;
      }
      clock.sync(value.serverTime, sent);
      joined = true;
      callbacks.status(true);
      callbacks.changed();
    } catch {
      if (!disposed && current === generation) {
        lost();
        retryJoin();
      }
    } finally {
      if (current === generation) joining = false;
    }
  };
  const sample = (input: unknown) => {
    const value = monitorSignalSchema
      .pick({ serverTime: true })
      .safeParse(input);
    if (value.success) clock.sync(value.data.serverTime);
  };
  const changed = (input: unknown) => {
    if (monitorSignalSchema.safeParse(input).success) callbacks.changed();
  };
  const patch = (input: unknown) => {
    const value = monitorPatchSchema.safeParse(input);
    if (value.success) {
      callbacks.patch(value.data);
      callbacks.changed();
    }
  };
  socket.on('connect', connected);
  socket.on('disconnect', lost);
  socket.on('connect_error', lost);
  socket.on('serverTime', sample);
  socket.on('admin:live:changed', changed);
  socket.on('admin:live:lot', patch);
  if (socket.connected) void connected();
  else connection.connect();
  return {
    now: () => clock.now(),
    close: () => {
      if (disposed) return;
      disposed = true;
      clearTimeout(retry);
      generation++;
      clock.disconnect();
      socket.off('connect', connected);
      socket.off('disconnect', lost);
      socket.off('connect_error', lost);
      socket.off('serverTime', sample);
      socket.off('admin:live:changed', changed);
      socket.off('admin:live:lot', patch);
      if (socket.connected) socket.emit('admin:live:unsubscribe');
      connection.release();
    },
  };
}
