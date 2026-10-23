import { Worker } from 'bullmq';

async function main() {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const worker = new Worker(
    'auction-ng-skeleton',
    async () => {
      throw new Error('No jobs are implemented in T01.');
    },
    {
      connection: {
        host: url.hostname,
        port: Number(url.port || 6379),
        username: url.username || undefined,
        password: url.password || undefined,
        db: Number(url.pathname.slice(1) || 0),
        ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
      },
    },
  );
  worker.on('error', () =>
    console.error('Worker connection unavailable. Check Redis.'),
  );
  await worker.waitUntilReady();
  console.log('Worker ready. No auction or money jobs are implemented in T01.');
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void worker.close();
    });
  }
}

main().catch(() => {
  console.error('Worker startup failed. Check Redis configuration.');
  process.exitCode = 1;
});
