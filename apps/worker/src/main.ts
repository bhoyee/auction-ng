import { startWithdrawalWorker } from './withdrawal-worker';
import { Queue, Worker } from 'bullmq';
import { startSearchWorker } from './search-worker';
import { startBidWorker } from './bid-worker';
import { startBidPersistenceWorker } from './bid-persistence-worker';
import { startClosingWorker } from './closing-worker';

async function main() {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const connection = {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: Number(url.pathname.slice(1) || 0),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
  const queue = new Queue('auction-ng-skeleton', { connection });
  queue.on('error', () =>
    console.error('Worker queue unavailable. Check Redis.'),
  );
  const token = process.env.RECONCILIATION_TOKEN;
  if (
    process.env.BIDS_ENABLED === 'true' &&
    (!process.env.BID_MAINTENANCE_TOKEN ||
      process.env.BID_MAINTENANCE_TOKEN.length < 32)
  )
    throw new Error('Bid maintenance requires a configured private token.');
  if (token && token.length < 32)
    throw new Error('Reconciliation token must have at least 32 characters.');
  if (token)
    await queue.upsertJobScheduler(
      'nightly-paystack-reconciliation',
      { pattern: '0 1 * * *', tz: 'Africa/Lagos' },
      {
        name: 'reconcile-payments',
        data: {},
        opts: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 60000 },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      },
    );
  const worker = new Worker(
    'auction-ng-skeleton',
    async (job) => {
      if (job.name !== 'reconcile-payments' || !token)
        throw new Error('Unknown or unconfigured job.');
      const baseUrl = new URL(
        process.env.INTERNAL_API_URL ?? 'http://localhost:4000',
      );
      if (
        !['localhost', '127.0.0.1', 'api'].includes(baseUrl.hostname) ||
        baseUrl.protocol !== 'http:'
      )
        throw new Error('Use the internal API address.');
      const response = await fetch(new URL('/payments/reconcile', baseUrl), {
        method: 'POST',
        redirect: 'error',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(120000),
      });
      if (!response.ok) throw new Error('Reconciliation failed.');
      const report = (await response.json()) as { mismatchCount?: unknown };
      if (
        typeof report.mismatchCount !== 'number' ||
        report.mismatchCount < 0 ||
        !Number.isSafeInteger(report.mismatchCount)
      )
        throw new Error('Invalid reconciliation report.');
      if (report.mismatchCount > 0)
        console.warn(
          'Paystack reconciliation found mismatches. Review the encrypted audit report.',
        );
      return { mismatchCount: report.mismatchCount };
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
  let searchWorker: Awaited<ReturnType<typeof startSearchWorker>> | undefined;
  let bidWorker: Awaited<ReturnType<typeof startBidWorker>> | undefined;
  let persistenceWorker:
    Awaited<ReturnType<typeof startBidPersistenceWorker>> | undefined;
  let closingWorker: Awaited<ReturnType<typeof startClosingWorker>> | undefined;
  let withdrawalWorker:
    Awaited<ReturnType<typeof startWithdrawalWorker>> | undefined;
  try {
    if (
      process.env.WITHDRAWALS_ENABLED === 'true' &&
      process.env.BID_MAINTENANCE_TOKEN
    )
      withdrawalWorker = await startWithdrawalWorker(connection, {
        token: process.env.BID_MAINTENANCE_TOKEN,
        apiUrl: process.env.INTERNAL_API_URL ?? 'http://localhost:4000',
      });
    searchWorker = process.env.SEARCH_SYNC_TOKEN
      ? await startSearchWorker(connection, {
          token: process.env.SEARCH_SYNC_TOKEN,
          apiUrl: process.env.INTERNAL_API_URL ?? 'http://localhost:4000',
        })
      : undefined;
    bidWorker =
      process.env.BIDS_ENABLED === 'true' && process.env.BID_MAINTENANCE_TOKEN
        ? await startBidWorker(connection, {
            token: process.env.BID_MAINTENANCE_TOKEN,
            apiUrl: process.env.INTERNAL_API_URL ?? 'http://localhost:4000',
          })
        : undefined;
    persistenceWorker =
      process.env.BIDS_ENABLED === 'true' && process.env.BID_MAINTENANCE_TOKEN
        ? await startBidPersistenceWorker(connection, {
            namespace: process.env.BID_NAMESPACE || undefined,
            token: process.env.BID_MAINTENANCE_TOKEN,
            apiUrl: process.env.INTERNAL_API_URL ?? 'http://localhost:4000',
          })
        : undefined;
    if (
      process.env.BIDS_ENABLED === 'true' &&
      process.env.BID_MAINTENANCE_TOKEN
    )
      closingWorker = await startClosingWorker(connection, {
        token: process.env.BID_MAINTENANCE_TOKEN,
        apiUrl: process.env.INTERNAL_API_URL ?? 'http://localhost:4000',
      });
  } catch (error) {
    await withdrawalWorker?.close();
    await closingWorker?.close();
    await persistenceWorker?.close();
    await bidWorker?.close();
    await searchWorker?.close();
    await worker.close();
    await queue.close();
    throw error;
  }
  console.log(
    searchWorker
      ? 'Search synchronization is scheduled.'
      : 'Search synchronization requires configuration.',
  );
  console.log(
    token
      ? 'Worker ready. Nightly Paystack reconciliation is scheduled.'
      : 'Worker ready. Paystack reconciliation requires configuration.',
  );
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void Promise.all([
        worker.close(),
        queue.close(),
        searchWorker?.close(),
        bidWorker?.close(),
        persistenceWorker?.close(),
        closingWorker?.close(),
        withdrawalWorker?.close(),
      ]);
    });
  }
}

main().catch(() => {
  console.error('Worker startup failed. Check Redis configuration.');
  process.exitCode = 1;
});
