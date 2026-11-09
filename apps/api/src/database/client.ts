import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

export function createDatabase(
  connectionString: string | undefined,
  onQuery?: (query: string) => void,
) {
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  const client = new PrismaClient({
    log: [{ level: 'query', emit: 'event' }],
    adapter: new PrismaPg({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 5000,
    }),
  });
  if (onQuery) client.$on('query', (event) => onQuery(event.query));
  return client;
}
