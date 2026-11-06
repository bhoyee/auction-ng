import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { storageMaintenanceReportSchema } from '@auction-ng/shared';

export async function startPickupStorageWorker(
  connection: ConnectionOptions,
  options: { token: string; apiUrl: string; queueName?: string },
) {
  const origin = new URL(options.apiUrl);
  if (
    options.token.length < 32 ||
    origin.protocol !== 'http:' ||
    !['api', 'localhost', '127.0.0.1'].includes(origin.hostname) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw Error(
      'Use a private pickup maintenance token and internal API origin.',
    );
  const queue = new Queue(options.queueName ?? 'lotvanta-pickup-storage', {
    connection,
  });
  queue.on('error', () =>
    console.warn('Pickup maintenance queue unavailable.'),
  );
  let worker: Worker | undefined;
  try {
    await queue.upsertJobScheduler(
      'maintain',
      { every: 60000 },
      {
        name: 'maintain',
        data: {},
        opts: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      },
    );
    worker = new Worker(
      queue.name,
      async (job) => {
        if (job.name !== 'maintain') throw Error('Unknown pickup job.');
        const response = await fetch(
          new URL('/pickup/storage/maintain', origin),
          {
            method: 'POST',
            redirect: 'error',
            headers: {
              Authorization: `Bearer ${options.token}`,
              'Content-Type': 'application/json',
            },
            body: '{}',
            signal: AbortSignal.timeout(120000),
          },
        );
        if (!response.ok) throw Error('Pickup maintenance will retry.');
        return storageMaintenanceReportSchema.parse(await response.json());
      },
      { connection, concurrency: 1 },
    );
    worker.on('error', () =>
      console.warn('Pickup maintenance worker unavailable.'),
    );
    worker.on('failed', () =>
      console.warn(
        'Pickup maintenance will retry; inspect reconciliation exceptions.',
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
