import { createHash } from 'node:crypto';
import type { Server } from 'socket.io';
import type { createClient } from 'redis';
import {
  liveLotSchema,
  realtimeEmptySchema,
  subscribeLotSchema,
  REALTIME_MAX_LOTS,
  REALTIME_HEARTBEAT_MS,
  type LiveLot,
  type privateLotUpdateSchema,
  type purchasedLotUpdateSchema,
} from '@auction-ng/shared';

/** A separate namespace has no sessions, user rooms, personal events or write handlers. */
export function publicMarket(
  io: Server,
  redis: ReturnType<typeof createClient>,
  options: {
    prefix: string;
    available: () => boolean;
    snapshot: (id: string) => Promise<LiveLot>;
  },
) {
  const market = io.of('/public');
  market.use(async (socket, next) => {
    try {
      if (
        !options.available() ||
        !realtimeEmptySchema.safeParse(socket.handshake.auth).success
      )
        throw new Error();
      const bucket = `${options.prefix}public-connections:${createHash('sha256').update(socket.handshake.address).digest('hex')}`;
      const count = await redis.incr(bucket);
      if (count === 1) await redis.pExpire(bucket, 60_000);
      if (count > 120) throw new Error();
      next();
    } catch {
      next(new Error('Public prices unavailable.'));
    }
  });
  market.on('connection', (socket) => {
    const lots = new Map<string, number>();
    let requests = 0,
      reset = Date.now() + 60_000;
    socket.use((_packet, next) => {
      if (Date.now() >= reset) {
        requests = 0;
        reset = Date.now() + 60_000;
      }
      if (++requests > 240) {
        socket.disconnect(true);
        return;
      }
      next();
    });
    socket.emit('serverTime', { serverTime: new Date().toISOString() });
    socket.on('clock:sync', (input: unknown, ack: unknown) => {
      if (
        realtimeEmptySchema.safeParse(input).success &&
        typeof ack === 'function'
      )
        ack({ serverTime: new Date().toISOString() });
    });
    socket.on('lot:subscribe', async (input: unknown, ack: unknown) => {
      if (typeof ack !== 'function') return;
      const parsed = subscribeLotSchema.safeParse(input);
      if (!parsed.success) {
        ack({ ok: false, code: 'invalid' });
        return;
      }
      const id = parsed.data.lotId;
      if (
        !options.available() ||
        (lots.size >= REALTIME_MAX_LOTS && !lots.has(id))
      ) {
        ack({ ok: false, code: 'unavailable' });
        return;
      }
      const generation = requests;
      lots.set(id, generation);
      try {
        // Join before the snapshot; client stream ordering resolves any racing update.
        await socket.join(`lot:${id}`);
        const value = liveLotSchema.parse(await options.snapshot(id));
        if (
          !socket.connected ||
          lots.get(id) !== generation ||
          value.lotId !== id
        )
          throw new Error();
        ack({ ok: true, lot: { ...value, isLeader: false } });
      } catch {
        if (lots.get(id) === generation) {
          lots.delete(id);
          await socket.leave(`lot:${id}`);
        }
        ack({ ok: false, code: 'unavailable' });
      }
    });
    socket.on('lot:unsubscribe', (input: unknown) => {
      const parsed = subscribeLotSchema.safeParse(input);
      if (parsed.success) {
        lots.delete(parsed.data.lotId);
        void socket.leave(`lot:${parsed.data.lotId}`);
      }
    });
  });
  const heartbeat = setInterval(() => {
    if (options.available())
      market.local.emit('serverTime', { serverTime: new Date().toISOString() });
    else market.local.disconnectSockets(true);
  }, REALTIME_HEARTBEAT_MS);
  return {
    update(
      event:
        | ReturnType<typeof privateLotUpdateSchema.parse>
        | ReturnType<typeof purchasedLotUpdateSchema.parse>,
    ) {
      market.local.to(`lot:${event.lotId}`).emit(
        'lot:update',
        liveLotSchema.parse({
          lotId: event.lotId,
          streamId: event.streamId,
          currentPriceKobo: event.currentPriceKobo,
          endsAt: new Date(event.endsAt).toISOString(),
          serverTime: new Date(event.serverTime).toISOString(),
          isLeader: false,
        }),
      );
    },
    invalidate() {
      market.local.emit('realtime:unavailable', {});
      market.local.disconnectSockets(true);
    },
    close() {
      clearInterval(heartbeat);
      market.local.disconnectSockets(true);
    },
  };
}
