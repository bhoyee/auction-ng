import { Pool } from 'pg';

export function createPool(connectionString: string | undefined): Pool {
  if (!connectionString)
    throw new Error('A database connection URL is required.');
  return new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 5000,
  });
}
