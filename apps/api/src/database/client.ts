import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

export function createDatabase(connectionString: string | undefined) {
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 5000,
    }),
  });
}
