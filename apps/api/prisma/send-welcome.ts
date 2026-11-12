// Queues the welcome email for buyers who signed up before it existed.
// Usage: pnpm --filter api welcome:send            (all active buyers)
//        pnpm --filter api welcome:send <email>    (one buyer)
// Safe to repeat: each buyer gets the welcome email at most once.
import { LedgerService } from '../src/ledger/ledger-service';
import { hashPii } from '../src/security/pii';
import { queueWelcomeEmail } from '../src/auth/welcome-queue';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const ledger = new LedgerService(process.env.DATABASE_URL);
  try {
    const buyers = await ledger.db.user.findMany({
      where: {
        role: 'buyer',
        status: 'active',
        archivedAt: null,
        emailVerifiedAt: { not: null },
        ...(email ? { emailHash: hashPii(email, 'email') } : {}),
      },
      select: { id: true, name: true, emailCiphertext: true },
    });
    let queued = 0;
    for (const buyer of buyers)
      if (await ledger.db.$transaction((tx) => queueWelcomeEmail(tx, buyer)))
        queued++;
    console.log(
      `Welcome email queued for ${queued} of ${buyers.length} buyer(s); the rest already had one.`,
    );
  } finally {
    await ledger.close();
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Welcome send failed.',
  );
  process.exitCode = 1;
});
