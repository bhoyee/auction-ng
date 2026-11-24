// Adds demo suppliers and batches to an existing local dev or demo database.
// Usage: pnpm --filter api db:seed:batches (DATABASE_URL must be local).
import { LedgerService } from '../src/ledger/ledger-service';
import { seedBatches } from './batch-seed';

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (
    process.env.NODE_ENV === 'production' ||
    !['localhost', '127.0.0.1', 'postgres'].includes(url.hostname)
  )
    throw new Error('Batch demo data is for local databases only.');
  const ledger = new LedgerService(url.href);
  try {
    await seedBatches(ledger.db);
    console.log(
      'Batch demo ready: 6 suppliers and 10 batches with their lots.',
    );
  } finally {
    await ledger.close();
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Batch seed failed.');
  process.exitCode = 1;
});
