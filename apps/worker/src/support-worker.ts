import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { supportDeliveryReportSchema, supportRules } from '@auction-ng/shared';
export async function startSupportWorker(
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
      'Use a private support-delivery token and internal API origin.',
    );
  const queue = new Queue(options.queueName ?? supportRules.deliveryQueue, {
    connection,
  });
  queue.on('error', () => console.warn('Support delivery queue unavailable.'));
  await queue.upsertJobScheduler(
    'deliver-support',
    { every: supportRules.deliveryPollMs },
    {
      name: 'deliver-support',
      data: {},
      opts: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    },
  );
  const worker = new Worker(
    queue.name,
    async (job) => {
      if (job.name !== 'deliver-support')
        throw Error('Unknown support delivery job');
      const response = await fetch(
        new URL('/internal/support/deliver', origin),
        {
          method: 'POST',
          redirect: 'error',
          headers: {
            Authorization: `Bearer ${options.token}`,
            'Content-Type': 'application/json',
          },
          body: '{}',
          signal: AbortSignal.timeout(125000),
        },
      );
      if (!response.ok) throw Error('Support email delivery will retry');
      return supportDeliveryReportSchema.parse(await response.json());
    },
    { connection, concurrency: 1 },
  );
  worker.on('error', () =>
    console.warn('Support delivery worker unavailable.'),
  );
  worker.on('failed', () =>
    console.warn(
      'Support email delivery will retry. Check mail configuration.',
    ),
  );
  await worker.waitUntilReady();
  return {
    close: async () => {
      await worker.close();
      await queue.close();
    },
  };
}
