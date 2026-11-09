import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { refreshOverviewAggregates } from '@auction-ng/api-client/analytics';
export async function startOverviewWorker(
  connection: ConnectionOptions,
  options: { token: string; apiUrl: string; queueName?: string },
) {
  const queue = new Queue(options.queueName ?? 'lotvanta-overview', {
    connection,
  });
  queue.on('error', () => console.warn('Analytics queue unavailable.'));
  let worker: Worker | undefined;
  try {
    for (const [name, every] of [
      ['current', 10000],
      ['history', 300000],
    ] as const)
      await queue.upsertJobScheduler(
        name,
        { every },
        {
          name,
          data: {},
          opts: {
            attempts: 5,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: 20,
            removeOnFail: 20,
          },
        },
      );
    worker = new Worker(
      queue.name,
      (job) => {
        if (!['history', 'current'].includes(job.name))
          throw Error('Unknown analytics job.');
        return refreshOverviewAggregates(
          options.apiUrl,
          options.token,
          job.name === 'history',
        );
      },
      { connection, concurrency: 1 },
    );
    worker.on('error', () => console.warn('Analytics worker unavailable.'));
    worker.on('failed', () =>
      console.warn(
        'Analytics refresh will retry; last confirmed snapshots remain available.',
      ),
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
