import { io } from 'socket.io-client';
import {
  liveLotSchema,
  outbidSchema,
  serverTimeSchema,
  subscribeLotSchema,
  compareStreamIds,
  REALTIME_STALE_MS,
  REALTIME_MAX_LOTS,
  realtimeCredentialsSchema,
  type LiveLot,
  type RealtimeCredentials,
  type OutbidEvent,
} from '@auction-ng/shared/realtime';
export type LiveLotState = Readonly<{
  status:
    'connecting' | 'live' | 'reconnecting' | 'unavailable' | 'unauthenticated';
  lot: LiveLot | null;
  clockOffsetMs: number;
}>;
const EMPTY: LiveLotState = {
  status: 'connecting',
  lot: null,
  clockOffsetMs: 0,
};
export function createRealtimeClient(
  baseUrl: string,
  options: {
    credentials?: () => RealtimeCredentials;
    onOutbid?: (event: OutbidEvent) => void;
  },
) {
  const url = new URL(baseUrl);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('Invalid realtime address.');
  const socket = io(options.credentials ? url.origin : `${url.origin}/public`, {
    autoConnect: false,
    auth: (callback) => {
      try {
        callback(
          options.credentials
            ? realtimeCredentialsSchema.parse(options.credentials())
            : {},
        );
      } catch {
        callback({});
      }
    },
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
    transports: ['websocket', 'polling'],
    tryAllTransports: true,
  });
  const watched = new Map<string, number>();
  const states = new Map<string, LiveLotState>();
  const listeners = new Set<() => void>();
  const retries = new Map<string, ReturnType<typeof setTimeout>>();
  const watchGeneration = new Map<string, number>();
  let watchCounter = 0;
  let persistent = false;
  let closed = false,
    authRequired = false,
    offset = 0,
    lastSeen = Date.now();
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let epoch = 0;
  const notify = () => listeners.forEach((listener) => listener());
  function stale(status: LiveLotState['status']) {
    for (const id of watched.keys())
      states.set(id, { status, lot: null, clockOffsetMs: offset });
    notify();
  }
  function apply(raw: unknown) {
    const parsed = liveLotSchema.safeParse(raw);
    if (!parsed.success || !watched.has(parsed.data.lotId)) return;
    const current = states.get(parsed.data.lotId)?.lot;
    if (current && compareStreamIds(parsed.data.streamId, current.streamId) < 0)
      return;
    lastSeen = Date.now();
    states.set(parsed.data.lotId, {
      status: 'live',
      lot: parsed.data,
      clockOffsetMs: offset,
    });
    notify();
  }
  async function subscribe(id: string) {
    const generation = epoch;
    const watchVersion = watchGeneration.get(id);
    const retry = () => {
      if (
        !closed &&
        !authRequired &&
        socket.connected &&
        watched.has(id) &&
        !retries.has(id)
      )
        retries.set(
          id,
          setTimeout(() => {
            retries.delete(id);
            void subscribe(id);
          }, 5000),
        );
    };
    try {
      const response: unknown = await socket
        .timeout(7000)
        .emitWithAck('lot:subscribe', { lotId: id });
      if (
        generation !== epoch ||
        watchVersion !== watchGeneration.get(id) ||
        !watched.has(id) ||
        !socket.connected
      )
        return;
      if (
        response &&
        typeof response === 'object' &&
        'ok' in response &&
        response.ok === true &&
        'lot' in response
      )
        apply(response.lot);
      else {
        states.set(id, {
          status: 'unavailable',
          lot: null,
          clockOffsetMs: offset,
        });
        notify();
        retry();
      }
    } catch {
      if (
        generation === epoch &&
        watchVersion === watchGeneration.get(id) &&
        watched.has(id)
      ) {
        states.set(id, {
          status: 'reconnecting',
          lot: null,
          clockOffsetMs: offset,
        });
        notify();
        retry();
      }
    }
  }
  function reconnect() {
    if (
      closed ||
      authRequired ||
      (!watched.size && !persistent) ||
      reconnectTimer
    )
      return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      socket.connect();
    }, 1000);
  }
  socket.on('connect', () => {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    epoch++;
    lastSeen = Date.now();
    for (const id of watched.keys()) void subscribe(id);
    const sent = Date.now();
    void socket
      .timeout(5000)
      .emitWithAck('clock:sync', {})
      .then((response: unknown) => {
        const clock = serverTimeSchema.safeParse(response);
        if (clock.success) {
          offset = Date.parse(clock.data.serverTime) - (sent + Date.now()) / 2;
          for (const [id, state] of states)
            states.set(id, { ...state, clockOffsetMs: offset });
          notify();
        }
      })
      .catch(() => {});
  });
  socket.on('lot:update', apply);
  socket.on('serverTime', (raw: unknown) => {
    if (serverTimeSchema.safeParse(raw).success) lastSeen = Date.now();
  });
  socket.on('user:outbid', (raw: unknown) => {
    const parsed = outbidSchema.safeParse(raw);
    if (!parsed.success) return;
    const current = states.get(parsed.data.lotId)?.lot;
    if (
      current &&
      (compareStreamIds(parsed.data.streamId, current.streamId) < 0 ||
        (compareStreamIds(parsed.data.streamId, current.streamId) === 0 &&
          current.isLeader))
    )
      return;
    options.onOutbid?.(parsed.data);
  });
  socket.on('realtime:unavailable', () => {
    stale('reconnecting');
  });
  socket.on('session:expired', () => {
    authRequired = true;
    stale('unauthenticated');
    socket.disconnect();
  });
  socket.on('disconnect', () => {
    epoch++;
    for (const timer of retries.values()) clearTimeout(timer);
    retries.clear();
    stale(authRequired ? 'unauthenticated' : 'reconnecting');
    reconnect();
  });
  socket.on('connect_error', (error) => {
    const code =
      'data' in error &&
      error.data &&
      typeof error.data === 'object' &&
      'code' in error.data
        ? error.data.code
        : undefined;
    if (code === 'unauthorized') {
      authRequired = true;
      stale('unauthenticated');
      socket.disconnect();
    } else {
      stale('reconnecting');
      reconnect();
    }
  });
  const watchdog = setInterval(() => {
    if (socket.connected && Date.now() - lastSeen > REALTIME_STALE_MS) {
      stale('reconnecting');
      socket.disconnect();
      reconnect();
    }
  }, 1000);
  return {
    connect() {
      if (closed) throw new Error('Realtime client is closed.');
      persistent = true;
      if (!authRequired) socket.connect();
    },
    watchLot(id: string) {
      subscribeLotSchema.parse({ lotId: id });
      if (closed) throw new Error('Realtime client is closed.');
      if (!watched.has(id) && watched.size >= REALTIME_MAX_LOTS)
        throw new Error('Too many live lots.');
      const first = !watched.has(id);
      watched.set(id, (watched.get(id) ?? 0) + 1);
      if (first) watchGeneration.set(id, ++watchCounter);
      if (!states.has(id)) states.set(id, EMPTY);
      if (socket.connected && first) void subscribe(id);
      else if (!authRequired) socket.connect();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const count = watched.get(id) ?? 0;
        if (count > 1) watched.set(id, count - 1);
        else {
          watched.delete(id);
          states.delete(id);
          watchGeneration.delete(id);
          clearTimeout(retries.get(id));
          retries.delete(id);
          if (socket.connected) socket.emit('lot:unsubscribe', { lotId: id });
          if (!watched.size && !persistent) socket.disconnect();
        }
      };
    },
    getSnapshot: (id: string) => states.get(id) ?? EMPTY,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reauthenticate() {
      authRequired = false;
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
      socket.disconnect();
      if (watched.size || persistent) socket.connect();
    },
    close() {
      closed = true;
      clearInterval(watchdog);
      clearTimeout(reconnectTimer);
      for (const timer of retries.values()) clearTimeout(timer);
      retries.clear();
      socket.disconnect();
      listeners.clear();
      watched.clear();
      states.clear();
    },
  };
}
export type RealtimeClient = ReturnType<typeof createRealtimeClient>;
