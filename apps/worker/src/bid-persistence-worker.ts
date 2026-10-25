import { randomUUID } from 'node:crypto';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import {
  BID_STREAM_GROUP,
  BID_STREAM_NAMESPACE,
  BID_PERSISTENCE_MS,
  BID_RECLAIM_MS,
  streamIdSchema,
} from '@auction-ng/shared';
import { createBidPersistenceClient } from '@auction-ng/api-client/bid-persistence';

function entries(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('Invalid bid stream delivery.');
  return value.map((entry: unknown) => {
    if (!Array.isArray(entry) || !Array.isArray(entry[1]))
      throw new Error('Invalid bid stream entry.');
    return streamIdSchema.parse(entry[0]);
  });
}
export async function startBidPersistenceWorker(
  connection: ConnectionOptions,
  options: {
    token: string;
    apiUrl: string;
    namespace?: string;
    queueName?: string;
  },
) {
  const persist = createBidPersistenceClient(options.apiUrl, options.token);
  const namespace = options.namespace ?? BID_STREAM_NAMESPACE;
  if (!/^[a-zA-Z0-9:_-]{1,160}$/.test(namespace))
    throw new Error('Invalid bid namespace.');
  const queue = new Queue(options.queueName ?? 'auction-ng-bid-persistence', {
    connection,
  });
  queue.on('error', () => console.error('Bid persistence queue unavailable.'));
  const consumer = randomUUID();
  let cursor = '0-0';
  let initialized = false;
  let startedWorker: Worker | undefined;
  try {
    await queue.upsertJobScheduler(
      'persist',
      { every: BID_PERSISTENCE_MS },
      {
        name: 'persist',
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
      queue.name,
      async (job) => {
        if (job.name !== 'persist')
          throw new Error('Unknown bid persistence job.');
        // The API must own/validate this Redis runtime before we create any keys.
        const ready = await persist([]);
        if (ready.namespace !== namespace)
          throw new Error('Bid namespace mismatch.');
        const client = await queue.client;
        const stream = `${namespace}accepted`;
        if (!initialized) {
          try {
            await client.xgroup(
              'CREATE',
              stream,
              BID_STREAM_GROUP,
              '0',
              'MKSTREAM',
            );
          } catch (error) {
            if (
              !(error instanceof Error) ||
              !error.message.startsWith('BUSYGROUP ')
            )
              throw error;
          }
          initialized = true;
        }
        const claimed: unknown = await client.call(
          'XAUTOCLAIM',
          stream,
          BID_STREAM_GROUP,
          consumer,
          BID_RECLAIM_MS,
          cursor,
          'COUNT',
          50,
        );
        if (
          !Array.isArray(claimed) ||
          typeof claimed[0] !== 'string' ||
          !Array.isArray(claimed[2]) ||
          claimed[2].length
        )
          throw new Error(
            'Missing or invalid pending bid entries; review recovery.',
          );
        cursor = streamIdSchema.parse(claimed[0]);
        let ids = entries(claimed[1]);
        if (!ids.length) {
          const fresh: unknown = await client.xreadgroup(
            'GROUP',
            BID_STREAM_GROUP,
            consumer,
            'COUNT',
            50,
            'STREAMS',
            stream,
            '>',
          );
          if (fresh === null) return { persisted: 0 };
          if (!Array.isArray(fresh) || !Array.isArray(fresh[0]))
            throw new Error('Invalid new bid delivery.');
          ids = entries(fresh[0][1]);
        }
        // A crash/lost reply before this point leaves deliveries pending for reclaim.
        const receipt = await persist(ids);
        if (receipt.namespace !== namespace)
          throw new Error('Bid receipt namespace mismatch.');
        await client.xack(stream, BID_STREAM_GROUP, ...ids);
        return { persisted: ids.length };
      },
      { connection, concurrency: 1 },
    );
    startedWorker = worker;
    worker.on('error', () =>
      console.error('Bid persistence worker unavailable.'),
    );
    worker.on('failed', () =>
      console.warn(
        'Bid persistence will retry; accepted entries remain pending.',
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
    await startedWorker?.close(true);
    await queue.close();
    throw error;
  }
}
