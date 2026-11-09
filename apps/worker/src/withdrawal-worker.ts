import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { withdrawalProcessReportSchema } from '@auction-ng/shared';
export async function startWithdrawalWorker(
  connection: ConnectionOptions,
  options: { token: string; apiUrl: string },
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
    throw Error('Invalid internal withdrawal worker configuration.');
  const queue = new Queue('auction-ng-withdrawals', { connection });
  queue.on('error', () => console.error('Withdrawal queue unavailable.'));
  try {
    await queue.upsertJobScheduler(
      'process',
      { every: 5000 },
      {
        name: 'process',
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
      queue.name,
      async (job) => {
        if (job.name !== 'process') throw Error('Unknown withdrawal job.');
        const reply = await fetch(
          new URL('/internal/withdrawals/process', api),
          {
            method: 'POST',
            redirect: 'error',
            headers: {
              Authorization: `Bearer ${options.token}`,
              'Content-Type': 'application/json',
            },
            body: '{}',
            signal: AbortSignal.timeout(180000),
          },
        );
        if (!reply.ok)
          throw Error(
            'Withdrawal processing unavailable; reservations remain protected.',
          );
        const report = withdrawalProcessReportSchema.parse(await reply.json());
        if (report.failed)
          throw Error(
            'Some withdrawals require reconciliation; funds remain protected.',
          );
        return report;
      },
      { connection, concurrency: 1 },
    );
    worker.on('error', () => console.error('Withdrawal worker unavailable.'));
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
