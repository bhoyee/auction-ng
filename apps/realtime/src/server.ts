import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

export async function createRealtime(redisUrl: string) {
  const publisher = createClient({ url: redisUrl });
  const subscriber = publisher.duplicate();
  publisher.on('error', () =>
    console.error('Realtime Redis publisher unavailable.'),
  );
  subscriber.on('error', () =>
    console.error('Realtime Redis subscriber unavailable.'),
  );
  const http = createServer((request, response) => {
    if (request.url !== '/health' || request.method !== 'GET') {
      response.writeHead(404).end();
      return;
    }
    const ready = publisher.isReady && subscriber.isReady;
    response.writeHead(ready ? 200 : 503, {
      'Content-Type': 'application/json',
    });
    response.end(JSON.stringify({ status: ready ? 'ok' : 'unavailable' }));
  });
  const io = new Server(http, { serveClient: false });
  await Promise.all([publisher.connect(), subscriber.connect()]);
  io.adapter(createAdapter(publisher, subscriber));
  return {
    http,
    async close() {
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await Promise.all([publisher.close(), subscriber.close()]);
    },
  };
}
