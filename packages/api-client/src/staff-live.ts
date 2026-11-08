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
  const lost = () => {
    generation++;
    clock.disconnect();
    callbacks.status(false);
  };
  const connected = async () => {
    const current = ++generation,
      sent = performance.now();
    try {
      const value = monitorJoinSchema.parse(
        await socket.timeout(5000).emitWithAck('admin:live:subscribe', {}),
      );
      if (disposed || current !== generation) return;
      if (!value.ok) {
        lost();
        return;
      }
      clock.sync(value.serverTime, sent);
      callbacks.status(true);
      callbacks.changed();
    } catch {
      if (!disposed && current === generation) lost();
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
    if (value.success) callbacks.patch(value.data);
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
