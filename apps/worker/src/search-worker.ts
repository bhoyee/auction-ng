import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { searchRules } from '@auction-ng/shared';

export async function startSearchWorker(
  connection: ConnectionOptions,
  options: { token: string; apiUrl: string; queueName?: string },
) {
  if (options.token.length < 32)
    throw new Error('Search sync token must have at least 32 characters.');
  const apiUrl = new URL(options.apiUrl);
  if (
    apiUrl.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', 'api'].includes(apiUrl.hostname) ||
    apiUrl.username ||
    apiUrl.password ||
    apiUrl.pathname !== '/' ||
    apiUrl.search ||
    apiUrl.hash
  )
    throw new Error('Use the private API origin for search synchronization.');
  const name = options.queueName ?? searchRules.queueName;
  const queue = new Queue(name, { connection });
  queue.on('error', () =>
    console.error('Search queue unavailable. Check Redis.'),
  );
  await queue.upsertJobScheduler(
    'sync-open-lots',
    { every: searchRules.pollMs },
    {
      name: 'sync-open-lots',
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
      if (job.name !== 'sync-open-lots') throw new Error('Unknown search job.');
      const response = await fetch(new URL('/internal/search/sync', apiUrl), {
        method: 'POST',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${options.token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
        signal: AbortSignal.timeout(searchRules.syncTimeoutMs + 5000),
      });
      if (!response.ok) throw new Error('Search synchronization failed.');
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== 'object' ||
        !('processed' in result) ||
        typeof result.processed !== 'number' ||
        !Number.isSafeInteger(result.processed) ||
        result.processed < 0 ||
        result.processed > searchRules.batchSize
      )
        throw new Error('Invalid search synchronization result.');
      return { processed: result.processed };
    },
    { connection, concurrency: 1 },
  );
  worker.on('error', () =>
    console.error('Search worker unavailable. Check Redis.'),
  );
  worker.on('failed', () =>
    console.warn(
      'Search synchronization will retry. Check the API and Meilisearch.',
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
