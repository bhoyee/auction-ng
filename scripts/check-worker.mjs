import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(
  new URL('../apps/worker/package.json', import.meta.url),
);
const { default: bullmq } = await import(
  pathToFileURL(require.resolve('bullmq')).href
);
const { Queue } = bullmq;
const deadline = setTimeout(() => process.exit(1), 4000);
deadline.unref();
const url = new URL(process.env.REDIS_URL);
const queue = new Queue('auction-ng-skeleton', {
  connection: {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: Number(url.pathname.slice(1) || 0),
    maxRetriesPerRequest: 1,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  },
});
queue.on('error', () => {});
const searchQueue = process.env.SEARCH_SYNC_TOKEN
  ? new Queue('auction-ng-search', {
      connection: {
        host: url.hostname,
        port: Number(url.port || 6379),
        username: url.username || undefined,
        password: url.password || undefined,
        db: Number(url.pathname.slice(1) || 0),
        maxRetriesPerRequest: 1,
        ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
      },
    })
  : undefined;
searchQueue?.on('error', () => {});
const bidQueue =
  process.env.BIDS_ENABLED === 'true' && process.env.BID_MAINTENANCE_TOKEN
    ? new Queue('auction-ng-bid-maintenance', {
        connection: {
          host: url.hostname,
          port: Number(url.port || 6379),
          username: url.username || undefined,
          password: url.password || undefined,
          db: Number(url.pathname.slice(1) || 0),
          maxRetriesPerRequest: 1,
          ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
        },
      })
    : undefined;
bidQueue?.on('error', () => {});
const persistenceQueue = bidQueue
  ? new Queue('auction-ng-bid-persistence', {
      connection: bidQueue.opts.connection,
    })
  : undefined;
persistenceQueue?.on('error', () => {});
const closingQueue = bidQueue
  ? new Queue('auction-ng-lot-closing', {
      connection: bidQueue.opts.connection,
    })
  : undefined;
closingQueue?.on('error', () => {});
try {
  if ((await queue.getWorkers()).length === 0) process.exitCode = 1;
  if (searchQueue && (await searchQueue.getWorkers()).length === 0)
    process.exitCode = 1;
  if (bidQueue && (await bidQueue.getWorkers()).length === 0)
    process.exitCode = 1;
  if (persistenceQueue && (await persistenceQueue.getWorkers()).length === 0)
    process.exitCode = 1;
  if (closingQueue && (await closingQueue.getWorkers()).length === 0)
    process.exitCode = 1;
} catch {
  process.exitCode = 1;
} finally {
  await queue.close();
  await searchQueue?.close();
  await bidQueue?.close();
  await persistenceQueue?.close();
  await closingQueue?.close();
  clearTimeout(deadline);
}
