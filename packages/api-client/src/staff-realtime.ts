import { io, type Socket } from 'socket.io-client';

type Credentials = { accessToken: string; deviceId: string };
type Connection = { socket: Socket; users: number; dispose: () => void };
const connections = new Map<string, Connection>();

/** One authenticated transport for the staff bell and live workspace. */
export function acquireStaffRealtime(
  baseUrl: string,
  credentials: Credentials,
): { socket: Socket; connect: () => void; release: () => void } {
  // Token rotation gets a separate authenticated connection. Never reuse a socket
  // across identities/devices, or mutate auth while other subscribers use it.
  const key = JSON.stringify([
    new URL(baseUrl).href,
    credentials.accessToken,
    credentials.deviceId,
  ]);
  let connection = connections.get(key);
  if (!connection) {
    let retry: ReturnType<typeof setTimeout> | undefined;
    let expired = false,
      disposed = false;
    const socket = io(baseUrl, {
      auth: { ...credentials },
      autoConnect: false,
      transports: ['websocket', 'polling'],
      tryAllTransports: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
    socket.on('session:expired', () => {
      expired = true;
      clearTimeout(retry);
    });
    socket.on('disconnect', (reason: string) => {
      if (reason === 'io server disconnect' && !expired && !disposed)
        retry = setTimeout(() => {
          if (!disposed && !expired) socket.connect();
        }, 1000);
    });
    connection = {
      socket,
      users: 0,
      dispose: () => {
        disposed = true;
        clearTimeout(retry);
      },
    };
    connections.set(key, connection);
  }
  const current = connection;
  current.users += 1;
  let released = false;
  return {
    socket: current.socket,
    connect: () => {
      if (!released && !current.socket.connected) current.socket.connect();
    },
    release: () => {
      if (released) return;
      released = true;
      current.users -= 1;
      if (!current.users) {
        current.dispose();
        connections.delete(key);
        current.socket.disconnect();
        current.socket.removeAllListeners();
      }
    },
  };
}

export function subscribeStaffActivity(
  baseUrl: string,
  credentials: Credentials,
  onChange: () => void,
  onStatus: (connected: boolean) => void,
) {
  const connection = acquireStaffRealtime(baseUrl, credentials);
  const { socket } = connection;
  const connected = () => {
    onStatus(true);
    onChange();
  };
  const disconnected = () => onStatus(false);
  socket.on('connect', connected);
  socket.on('disconnect', disconnected);
  socket.on('connect_error', disconnected);
  socket.on('staff:changed', onChange);
  if (socket.connected) connected();
  else connection.connect();
  return () => {
    socket.off('connect', connected);
    socket.off('disconnect', disconnected);
    socket.off('connect_error', disconnected);
    socket.off('staff:changed', onChange);
    connection.release();
  };
}
