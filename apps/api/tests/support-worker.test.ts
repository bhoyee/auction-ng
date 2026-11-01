import { expect, it } from 'vitest';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { startSupportWorker } from '../../worker/src/support-worker';
it('schedules and delivers support mail without depending on active bidding jobs', async () => {
  const redis = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const connection = {
    host: redis.hostname,
    port: Number(redis.port || 6379),
    username: redis.username || undefined,
    password: redis.password || undefined,
    db: Number(redis.pathname.slice(1) || 0),
  };
  const token = randomUUID() + randomUUID();
  let calls = 0;
  const http = createServer((req, res) => {
    if (
      req.url !== '/internal/support/deliver' ||
      req.headers.authorization !== 'Bearer ' + token
    ) {
      res.writeHead(401).end();
      return;
    }
    calls++;
    res.setHeader('Content-Type', 'application/json');
    res.end('{"ok":true}');
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  if (!address || typeof address === 'string') throw Error('Missing port');
  const worker = await startSupportWorker(connection, {
    token,
    apiUrl: `http://127.0.0.1:${address.port}`,
    queueName: 'test-support-' + randomUUID(),
  });
  try {
    await expect.poll(() => calls, { timeout: 8000 }).toBeGreaterThan(0);
  } finally {
    await worker.close();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  }
});
