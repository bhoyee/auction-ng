import { createRealtime } from './server';

async function main() {
  const server = await createRealtime(
    process.env.REDIS_URL ?? 'redis://localhost:6379',
    { namespace: process.env.BID_NAMESPACE || undefined },
  );
  server.http.listen(
    Number(process.env.REALTIME_PORT ?? 4001),
    '0.0.0.0',
    () => {
      console.log('Realtime gateway ready.');
    },
  );
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void server.close();
    });
  }
}

main().catch(() => {
  console.error('Realtime startup failed. Check Redis and port availability.');
  process.exitCode = 1;
});
