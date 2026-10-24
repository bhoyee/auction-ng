import { seedDatabase } from './seed-data';

seedDatabase()
  .then(() =>
    console.log(
      'Demo seed ready: 1 hub, 12 categories, 200 lots, 20 buyers and 3 staff. Wallets remain empty.',
    ),
  )
  .catch(() => {
    console.error(
      'Demo seed failed. Check database access and the encryption/lookup keys. No credentials were logged.',
    );
    process.exitCode = 1;
  });
