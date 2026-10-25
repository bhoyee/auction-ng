import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { BID_MAINTENANCE_MS } from '@auction-ng/shared';

export async function startBidWorker(
  connection: ConnectionOptions,
  options: { token: string; apiUrl: string; queueName?: string },
) {
  const api = new URL(options.apiUrl);
  if (
    options.token.length < 32 ||
    api.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', 'api'].includes(api.hostname) ||
    api.username ||
    api.password ||
    api.pathname !== '/' ||
    api.search ||
    api.hash
  )
    throw new Error('Invalid private bid maintenance configuration.');
  const name = options.queueName ?? 'auction-ng-bid-maintenance';
  const queue = new Queue(name, { connection });
  queue.on('error', () => console.error('Bid maintenance queue unavailable.'));
  try {
    await queue.upsertJobScheduler(
      'maintain',
      { every: BID_MAINTENANCE_MS },
      {
        name: 'maintain',
        data: {},
        opts: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 500 },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      },
    );
    const worker = new Worker(
      name,
      async (job) => {
        if (job.name !== 'maintain')
          throw new Error('Unknown bid maintenance job.');
        const response = await fetch(new URL('/internal/bids/maintain', api), {
          method: 'POST',
          redirect: 'error',
          headers: {
            Authorization: `Bearer ${options.token}`,
            'Content-Type': 'application/json',
          },
          body: '{}',
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok)
          throw new Error(
            'Bid maintenance failed; reservations remain protected.',
          );
        const result: unknown = await response.json();
        if (
          !result ||
          typeof result !== 'object' ||
          !('checked' in result) ||
          typeof result.checked !== 'number' ||
          !Number.isSafeInteger(result.checked) ||
          result.checked < 0 ||
          result.checked > 50
        )
          throw new Error('Invalid bid maintenance result.');
        return { checked: result.checked };
      },
      { connection, concurrency: 1 },
    );
    worker.on('error', () =>
      console.error('Bid maintenance worker unavailable.'),
    );
    worker.on('failed', () =>
      console.warn('Bid maintenance will retry; check API availability.'),
    );
    await worker.waitUntilReady();
    return {
      close: async () => {
        await worker.close();
        await queue.close();
      },
    };
  } catch (error) {
    await queue.close();
    throw error;
  }
}
