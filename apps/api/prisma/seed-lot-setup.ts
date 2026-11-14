// Adds the Lot setup demo data to an existing local dev or demo database.
// Usage: pnpm --filter api db:seed:lot-setup (DATABASE_URL must be local).
import { LedgerService } from '../src/ledger/ledger-service';
import { seedLotSetup } from './lot-setup-seed';

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (
    process.env.NODE_ENV === 'production' ||
    !['localhost', '127.0.0.1', 'postgres'].includes(url.hostname)
  )
    throw new Error('Lot setup demo data is for local databases only.');
  const ledger = new LedgerService(url.href);
  try {
    await seedLotSetup(ledger.db);
    console.log(
      'Lot setup demo ready: 8 categories, 4 pickup locations, bins, 5 conditions, brands and suppliers.',
    );
  } finally {
    await ledger.close();
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Lot setup seed failed.',
  );
  process.exitCode = 1;
});
