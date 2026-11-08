import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { refreshLiveMonitor } from '@auction-ng/api-client/analytics';
export async function startLiveMonitorWorker(
  connection: ConnectionOptions,
  options: { apiUrl: string; token: string; queueName?: string },
) {
  const queue = new Queue(options.queueName ?? 'lotvanta-live-monitor', {
    connection,
  });
  queue.on('error', () => console.warn('Live monitor queue unavailable.'));
  let worker: Worker | undefined;
  try {
    await queue.upsertJobScheduler(
      'current',
      { every: 1000 },
      {
        name: 'current',
        data: {},
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 5,
          removeOnFail: 5,
        },
      },
    );
    worker = new Worker(
      queue.name,
      (job) => {
        if (job.name !== 'current') throw Error('Unknown Live monitor job.');
        return refreshLiveMonitor(options.apiUrl, options.token);
      },
      { connection, concurrency: 1 },
    );
    worker.on('error', () => console.warn('Live monitor worker unavailable.'));
    worker.on('failed', () =>
      console.warn(
        'Live monitor refresh will retry; expired snapshots remain unavailable.',
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
