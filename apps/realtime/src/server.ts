import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { publicMarket } from './public-market';
import {
  BID_STREAM_NAMESPACE,
  REALTIME_HEARTBEAT_MS,
  REALTIME_MAX_LOTS,
  realtimeCredentialsSchema,
  realtimeSessionSchema,
  subscribeLotSchema,
  liveLotSchema,
  realtimeEmptySchema,
  privateLotUpdateSchema,
  type RealtimeCredentials,
  type RealtimeSession,
  type LiveLot,
} from '@auction-ng/shared';
import {
  createRealtimeApiClient,
  RealtimeApiError,
} from '@auction-ng/api-client/realtime-api';

type SocketData = {
  credentials: RealtimeCredentials;
  identity: RealtimeSession;
  requests: number;
  resetAt: number;
  lots: Map<string, number>;
};
type RealtimeOptions = {
  namespace?: string;
  apiUrl?: string;
  origins?: string[];
  connectionLimit?: number;
  authenticate?: (credentials: RealtimeCredentials) => Promise<RealtimeSession>;
  snapshot?: (
    credentials: RealtimeCredentials,
    lotId: string,
  ) => Promise<LiveLot>;
  publicSnapshot?: (lotId: string) => Promise<LiveLot>;
};
export async function createRealtime(
  redisUrl: string,
  options: RealtimeOptions = {},
) {
  const namespace = options.namespace ?? BID_STREAM_NAMESPACE;
  if (!/^[a-zA-Z0-9:_-]{1,160}$/.test(namespace))
    throw new Error('Invalid realtime namespace.');
  const api = createRealtimeApiClient(
    options.apiUrl ?? process.env.INTERNAL_API_URL ?? 'http://localhost:4000',
  );
  const authenticate = options.authenticate ?? api.authenticate;
  const snapshot = options.snapshot ?? api.snapshot;
  const origins =
    options.origins ??
    (
      process.env.REALTIME_WEB_ORIGINS ??
      'http://localhost:3300,http://localhost:3301'
    )
      .split(',')
      .map((value) => value.trim());
  const publisher = createClient({
    url: redisUrl,
    commandOptions: { timeout: 5000 },
  });
  const subscriber = publisher.duplicate();
  const updates = publisher.duplicate();
  let bootstrapped = false;
  let available = false,
    closing = false;
  const http = createServer((request, response) => {
    if (request.url !== '/health' || request.method !== 'GET') {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(available ? 200 : 503, {
      'Content-Type': 'application/json',
    });
    response.end(JSON.stringify({ status: available ? 'ok' : 'unavailable' }));
  });
  const io = new Server(http, {
    serveClient: false,
    maxHttpBufferSize: 4096,
    pingInterval: 10000,
    pingTimeout: 10000,
    cors: { origin: origins },
    allowRequest: (request, done) =>
      done(
        null,
        !request.headers.origin || origins.includes(request.headers.origin),
      ),
  });
  const localSockets = () => [...io.of('/').sockets.values()];
  const publicPrices = publicMarket(io, publisher, {
    prefix: namespace,
    available: () => available,
    snapshot: options.publicSnapshot ?? api.publicSnapshot,
  });
  function invalidate() {
    available = false;
    publicPrices.invalidate();
    for (const socket of localSockets()) {
      socket.emit('realtime:unavailable', {});
      socket.disconnect(true);
    }
  }
  for (const client of [publisher, subscriber, updates]) {
    client.on('error', () => {
      invalidate();
      console.error('Realtime Redis unavailable.');
    });
    client.on('reconnecting', invalidate);
    client.on('end', invalidate);
    client.on('ready', () => {
      if (
        bootstrapped &&
        !closing &&
        publisher.isReady &&
        subscriber.isReady &&
        updates.isReady
      )
        void restoreBridge().catch(invalidate);
    });
  }
  const data = (socket: ReturnType<typeof localSockets>[number]) =>
    socket.data as SocketData;
  async function validSockets(sockets: ReturnType<typeof localSockets>) {
    if (!sockets.length) return [];
    const revoked = await publisher.hmGet(
      `${namespace}revoked`,
      sockets.map((socket) => data(socket).identity.sessionId),
    );
    return sockets.filter((socket, index) => {
      if (
        revoked[index] ||
        Date.parse(data(socket).identity.expiresAt) <= Date.now()
      ) {
        socket.emit('session:expired', {});
        socket.disconnect(true);
        return false;
      }
      return socket.connected;
    });
  }
  io.use(async (socket, next) => {
    try {
      if (!available) throw new Error('Unavailable');
      const credentials = realtimeCredentialsSchema.parse(
        socket.handshake.auth,
      );
      const ip = socket.handshake.address;
      const bucket = `auction:realtime:rate:${namespace}:${createHash('sha256').update(ip).digest('hex')}`;
      const count = await publisher.incr(bucket);
      if (count === 1) await publisher.pExpire(bucket, 60000);
      if (count > (options.connectionLimit ?? 2000))
        throw new Error('Rate limit');
      const identity = realtimeSessionSchema.parse(
        await authenticate(credentials),
      );
      const userBucket = `auction:realtime:user-rate:${namespace}:${identity.userId}`;
      const userCount = await publisher.incr(userBucket);
      if (userCount === 1) await publisher.pExpire(userBucket, 60000);
      if (userCount > 20) throw new Error('Rate limit');
      if (
        Date.parse(identity.expiresAt) <= Date.now() ||
        (await publisher.hExists(`${namespace}revoked`, identity.sessionId))
      )
        throw new RealtimeApiError(401);
      socket.data = {
        credentials,
        identity,
        requests: 0,
        resetAt: Date.now() + 60000,
        lots: new Map<string, number>(),
      } satisfies SocketData;
      next();
    } catch (cause) {
      const code =
        (cause instanceof RealtimeApiError &&
          [401, 403].includes(cause.status)) ||
        !realtimeCredentialsSchema.safeParse(socket.handshake.auth).success
          ? 'unauthorized'
          : 'unavailable';
      const error = new Error(
        code === 'unauthorized' ? 'Sign in again.' : 'Realtime unavailable.',
      );
      Object.assign(error, {
        data: { code },
      });
      next(error);
    }
  });
  io.on('connection', (socket) => {
    socket.use((_packet, next) => {
      const current = data(socket);
      if (Date.now() >= current.resetAt) {
        current.resetAt = Date.now() + 60000;
        current.requests = 0;
      }
      current.requests++;
      if (current.requests > 240) {
        socket.disconnect(true);
        return;
      }
      next();
    });
    void socket.join(`user:${data(socket).identity.userId}`);
    socket.emit('serverTime', { serverTime: new Date().toISOString() });
    socket.on('lot:subscribe', async (input: unknown, ack: unknown) => {
      if (typeof ack !== 'function') return;
      const reply = ack as (value: unknown) => void;
      const parsed = subscribeLotSchema.safeParse(input);
      if (!parsed.success) {
        reply({ ok: false, code: 'invalid' });
        return;
      }
      const current = data(socket);
      if (
        !available ||
        (current.lots.size >= REALTIME_MAX_LOTS &&
          !current.lots.has(parsed.data.lotId))
      ) {
        reply({ ok: false, code: 'unavailable' });
        return;
      }
      const subscription = current.requests;
      current.lots.set(parsed.data.lotId, subscription);
      try {
        if (!(await validSockets([socket])).length) return;
        await socket.join(`lot:${parsed.data.lotId}`);
        const state = liveLotSchema.parse(
          await snapshot(current.credentials, parsed.data.lotId),
        );
        if (
          state.lotId !== parsed.data.lotId ||
          current.lots.get(parsed.data.lotId) !== subscription ||
          !(await validSockets([socket])).length
        )
          throw new Error('Invalid snapshot');
        reply({ ok: true, lot: state });
      } catch {
        if (current.lots.get(parsed.data.lotId) === subscription) {
          current.lots.delete(parsed.data.lotId);
          await socket.leave(`lot:${parsed.data.lotId}`);
        }
        reply({ ok: false, code: 'unavailable' });
      }
    });
    socket.on('lot:unsubscribe', (input: unknown) => {
      const parsed = subscribeLotSchema.safeParse(input);
      if (parsed.success) {
        data(socket).lots.delete(parsed.data.lotId);
        void socket.leave(`lot:${parsed.data.lotId}`);
      }
    });
    socket.on('clock:sync', (input: unknown, ack: unknown) => {
      if (
        typeof ack === 'function' &&
        realtimeEmptySchema.safeParse(input).success
      )
        (ack as (value: unknown) => void)({
          serverTime: new Date().toISOString(),
        });
    });
  });
  const onUpdate = (raw: string) => {
    void (async () => {
      const event = privateLotUpdateSchema.parse(JSON.parse(raw));
      publicPrices.update(event);
      const candidates = localSockets().filter(
        (socket) =>
          socket.rooms.has(`lot:${event.lotId}`) ||
          data(socket).identity.userId === event.previousLeaderId ||
          data(socket).identity.userId === event.requesterId,
      );
      const sockets = await validSockets(candidates);
      for (const socket of sockets) {
        const isLeader = data(socket).identity.userId === event.leaderId;
        const publicState = {
          lotId: event.lotId,
          streamId: event.streamId,
          currentPriceKobo: event.currentPriceKobo,
          endsAt: new Date(event.endsAt).toISOString(),
          serverTime: new Date(event.serverTime).toISOString(),
        };
        if (socket.rooms.has(`lot:${event.lotId}`))
          socket.emit('lot:update', { ...publicState, isLeader });
        if (
          !isLeader &&
          (data(socket).identity.userId === event.previousLeaderId ||
            data(socket).identity.userId === event.requesterId)
        )
          socket.emit('user:outbid', publicState);
      }
    })().catch(invalidate);
  };
  let restoring: Promise<void> | undefined;
  function restoreBridge(): Promise<void> {
    if (restoring) return restoring;
    restoring = updates
      .subscribe(`${namespace}personal-updates`, onUpdate)
      .then(() => {
        available =
          !closing &&
          publisher.isReady &&
          subscriber.isReady &&
          updates.isReady;
      })
      .finally(() => {
        restoring = undefined;
      });
    return restoring;
  }
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let lease: ReturnType<typeof setInterval> | undefined;
  try {
    await Promise.all([
      publisher.connect(),
      subscriber.connect(),
      updates.connect(),
    ]);
    io.adapter(createAdapter(publisher, subscriber));
    await restoreBridge();
    bootstrapped = true;

    heartbeat = setInterval(() => {
      void validSockets(localSockets())
        .then((sockets) => {
          if (available)
            sockets.forEach((socket) =>
              socket.emit('serverTime', {
                serverTime: new Date().toISOString(),
              }),
            );
        })
        .catch(invalidate);
    }, REALTIME_HEARTBEAT_MS);
    lease = setInterval(() => {
      for (const socket of localSockets())
        void authenticate(data(socket).credentials)
          .then((identity) => {
            if (identity.sessionId !== data(socket).identity.sessionId)
              throw new RealtimeApiError(401);
          })
          .catch((error) => {
            socket.emit(
              error instanceof RealtimeApiError &&
                [401, 403].includes(error.status)
                ? 'session:expired'
                : 'realtime:unavailable',
              {},
            );
            socket.disconnect(true);
          });
    }, 30000);
    return {
      http,
      io,
      async close() {
        closing = true;
        available = false;
        clearInterval(heartbeat);
        clearInterval(lease);
        publicPrices.close();
        await new Promise<void>((resolve) => io.close(() => resolve()));
        await Promise.all([
          publisher.close(),
          subscriber.close(),
          updates.close(),
        ]);
      },
    };
  } catch (error) {
    closing = true;
    clearInterval(heartbeat);
    clearInterval(lease);
    publicPrices.close();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    for (const client of [publisher, subscriber, updates])
      if (client.isOpen) client.destroy();
    throw error;
  }
}
