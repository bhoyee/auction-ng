import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { CLOSING_POLL_MS, closingReportSchema } from '@auction-ng/shared';

export async function startClosingWorker(
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
    throw new Error('Invalid internal closing configuration.');
  const name = options.queueName ?? 'auction-ng-lot-closing';
  const queue = new Queue(name, { connection });
  queue.on('error', () => console.error('Closing queue unavailable.'));
  try {
    await queue.upsertJobScheduler(
      'close',
      { every: CLOSING_POLL_MS },
      {
        name: 'close',
        data: {},
        opts: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      },
    );
    const worker = new Worker(
      name,
      async (job) => {
        if (job.name !== 'close') throw new Error('Unknown closing job.');
        const response = await fetch(new URL('/internal/lots/close', api), {
          method: 'POST',
          redirect: 'error',
          headers: {
            Authorization: `Bearer ${options.token}`,
            'Content-Type': 'application/json',
          },
          body: '{}',
          signal: AbortSignal.timeout(180000),
        });
        if (!response.ok)
          throw new Error(
            'Closing batch unavailable; frozen results and funds remain protected.',
          );
        const report = closingReportSchema.parse(await response.json());
        if (report.failed)
          throw new Error('Some closings need retry or operator review.');
        return report;
      },
      { connection, concurrency: 1 },
    );
    worker.on('error', () => console.error('Closing worker unavailable.'));
    worker.on('failed', () =>
      console.warn(
        'Closing failed. Retry scheduled; review settlement error timestamps.',
      ),
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
