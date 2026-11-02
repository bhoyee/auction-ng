import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
const root = fileURLToPath(new URL('../', import.meta.url));
const target = path.join(root, '.env.mobile.local');
if (!fs.existsSync(target)) throw Error('Run pnpm mobile:connect first.');
const env = parseEnv(fs.readFileSync(target, 'utf8'));
const api = env.EXPO_PUBLIC_API_URL,
  realtime = env.EXPO_PUBLIC_REALTIME_URL;
if (!api || !realtime)
  throw Error(
    'Local public service origins are missing. Run pnpm mobile:connect.',
  );
const json = async (origin, route) => {
  const response = await fetch(new URL(route, origin), {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw Error(`${route} returned HTTP ${response.status}.`);
  return response.json();
};
try {
  const [health, clock, catalogue, upcoming] = await Promise.all([
    json(api, '/health'),
    json(api, '/time'),
    json(api, '/lots?limit=1'),
    json(api, '/upcoming-lots?limit=1'),
    json(realtime, '/health'),
  ]);
  if (
    health.status !== 'ok' ||
    !Number.isFinite(Date.parse(clock.serverTime)) ||
    !Array.isArray(catalogue.items) ||
    !Array.isArray(upcoming.items)
  )
    throw Error('A service returned an unexpected public response.');
  console.log(
    'LAN API health, server clock, catalogue, Upcoming Deals and realtime health respond.',
  );
  const require = createRequire(
    new URL('../packages/api-client/package.json', import.meta.url),
  );
  const { io } = require('socket.io-client');
  const socket = io(new URL('/public', realtime).href, {
    autoConnect: false,
    reconnection: false,
    transports: ['websocket'],
    timeout: 5000,
  });
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      socket.close();
      reject(Error('Public live-price connection timed out.'));
    }, 12000);
    socket.once('connect_error', () => {
      clearTimeout(deadline);
      socket.close();
      reject(Error('Public Socket.IO connection failed.'));
    });
    socket.once('connect', async () => {
      try {
        const clock = await socket.timeout(5000).emitWithAck('clock:sync', {});
        if (!Number.isFinite(Date.parse(clock.serverTime)))
          throw Error('Socket clock could not be confirmed.');
        if (catalogue.items[0]) {
          const result = await socket
            .timeout(5000)
            .emitWithAck('lot:subscribe', { lotId: catalogue.items[0].id });
          if (result?.ok !== true || !result.lot)
            throw Error(
              'Live snapshots are unavailable. Inspect bid-engine recovery status; do not bypass its fence.',
            );
        }
        console.log(
          'Public Socket.IO connection and clock verified' +
            (catalogue.items.length
              ? '; a fresh lot snapshot is available.'
              : '; no open lot is available to test a snapshot.'),
        );
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        clearTimeout(deadline);
        socket.close();
      }
    });
    socket.connect();
  });
  console.log(
    'PC-side checks passed. Confirm the health URL in your phone browser, then reload Expo Go.',
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Mobile connection checks failed.',
  );
  process.exitCode = 1;
}
