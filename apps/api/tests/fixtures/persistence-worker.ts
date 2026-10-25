import { startBidPersistenceWorker } from '../../../worker/src/bid-persistence-worker';
const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
void startBidPersistenceWorker(
  {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    db: Number(url.pathname.slice(1) || 0),
  },
  {
    apiUrl: process.env.INTERNAL_API_URL ?? '',
    token: process.env.BID_MAINTENANCE_TOKEN ?? '',
    namespace: process.env.TEST_BID_PREFIX,
    queueName: process.env.TEST_BID_QUEUE,
  },
);
