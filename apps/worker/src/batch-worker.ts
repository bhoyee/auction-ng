import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { recalculateBatches } from '@auction-ng/api-client/analytics';

// Recalculates batches whose lots, invoices or costs changed.
export async function startBatchWorker(
  connection: ConnectionOptions,
  options: { apiUrl: string; token: string; queueName?: string },
) {
  const queue = new Queue(options.queueName ?? 'giddydeal-batches', {
    connection,
  });
  queue.on('error', () => console.warn('Batch queue unavailable.'));
  let worker: Worker | undefined;
  try {
    await queue.upsertJobScheduler(
      'recalculate',
      { every: 5_000 },
      {
        name: 'recalculate',
        data: {},
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: 5,
          removeOnFail: 20,
        },
      },
    );
    worker = new Worker(
      queue.name,
      (job) => {
        if (job.name !== 'recalculate') throw Error('Unknown batch job.');
        return recalculateBatches(options.apiUrl, options.token);
      },
      { connection, concurrency: 1 },
    );
    worker.on('error', () => console.warn('Batch worker unavailable.'));
    worker.on('failed', () =>
      console.warn('Batch recalculation will retry; last numbers stay.'),
    );
    await worker.waitUntilReady();
    const active = worker;
    return {
      close: async () => {
        await active.close();
        await queue.close();
      },
    };
  } catch (error) {
    await worker?.close();
    await queue.close();
    throw error;
  }
}
