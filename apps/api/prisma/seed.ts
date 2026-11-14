import { seedDatabase } from './seed-data';
import { seedLotSetup } from './lot-setup-seed';
import { LedgerService } from '../src/ledger/ledger-service';

seedDatabase()
  .then(async () => {
    const ledger = new LedgerService(process.env.DATABASE_URL);
    try {
      await seedLotSetup(ledger.db);
    } finally {
      await ledger.close();
    }
  })
  .then(() =>
    console.log(
      'Demo seed ready: 4 pickup hubs with bins, 8 categories with subcategories, 200 lots, 20 buyers and 3 staff. Wallets remain empty.',
    ),
  )
  .catch(() => {
    console.error(
      'Demo seed failed. Check database access and the encryption/lookup keys. No credentials were logged.',
    );
    process.exitCode = 1;
  });
