# Local demo runtime recovery — 2026-11-02

MONEY/BID CHANGE — needs human review.

The owner approved an offline recovery workflow after Docker Desktop restarted Redis. The runtime identity safeguard correctly blocked live snapshots rather than trusting reservations after an unexpected restart.

The new operator-only command verifies preserved stream events against durable acceptance receipts using the existing persistence validator inside a read-only transaction. It validates reservation totals, canonical leader state, ledger balances, completed Buy Now invoices/debits, Redis durability and unfinished-work barriers. Empty launches remain untouched for the existing worker. Unknown or uncertain state remains blocked.

Applying the exact report writes an encrypted idempotency journal and audit record, fences API startup and conditionally rebinds the runtime identity. Exact retries recover interrupted commits. No bid, hold, ledger entry or balance is changed by recovery. This command is restricted to the local demo database; it is not a production recovery facility or a reconstruction mechanism for lost Redis state.

Validation: 15 focused recovery integration tests and 29 existing bid funding/persistence regression tests pass. Cases include simultaneous exact retries, competing operator keys, both interrupted commit boundaries, tampered/missing proofs, incomplete purchases, verified sold markers and empty/nonempty launches. API type checks, changed-file lint and the API Docker production build pass.

The local demo operation completed against 58 accepted events and one existing active reservation. After restarting API/realtime/worker, `pnpm mobile:check` passes LAN health/catalogue/time and Socket.IO clock plus fresh lot snapshot checks. The phone had separately confirmed LAN API health. Final Expo Go countdown confirmation remains with the user. T14 as a whole remains in progress.
