# T12 — Lot closing and invoicing

Implemented on `task/t12-lot-closing` in [draft PR #13](https://github.com/bhoyee/auction-ng/pull/13), stacked on T11. **MONEY/BID CHANGE — needs human review** before merge. No live payment endpoints or real external email service were used.

## What changed

- `apps/api/prisma/schema.prisma` and the new `20261025001000_lot_closing` migration add immutable winner settlements, a contiguous persistence cursor, encrypted pickup tokens and unique notification references. [All 31 tables, columns/types, relations, indexes and unique/check constraints](specs/database-schema.md) are regenerated from PostgreSQL.
- `apps/api/src/bids` and `closing/close-lua.ts` freeze the final Redis result against server time and soft-close extensions. Every stream entry through the closing barrier must have a verified committed receipt before PostgreSQL freezes the winner. No consumer group is reset and no source event is trimmed.
- `apps/api/src/ledger` captures additive holds atomically, charges the actual fee-inclusive invoice once, releases unused funds and fingerprints group retries. It remains the only ledger writer.
- `apps/api/src/closing` commits invoices, pickup fulfilments and encrypted notifications with the charge. Infrastructure errors preserve frozen results for retry and operator review. A genuine shortage gets 24 hours, then one fenced strike and a new draft relisting for staff to schedule. Original history remains intact.
- `apps/worker/src/closing-worker.ts`, the main worker and health check schedule and monitor bounded closing batches. The new internal route and authenticated buyer pickup-pass route are documented in Swagger and typed in `packages/api-client`.
- `packages/ui/emails/winner-email.ts`, the generated API asset and notification sender add professional HTML/plain-text receipts with exact Naira fees, payment status and pickup information. Dynamic HTML is escaped. Local Mailpit delivery is tested; pickup tokens and private spending limits are excluded from email. [Responsive screenshots and design review](design/t12-email/README.md).
- Shared closing contracts, constants and status vocabulary live in `packages/shared`. CI uses the existing pinned Mailpit image for real local-inbox acceptance. No npm dependency or package version changed. `.env.example` explains that the existing bid switch and private worker token now cover closing too.

## Validation

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. The full suite passes **260 tests**: 208 functional, 36 money/bid, seven realtime, eight search and one catalogue performance test. All **12** Playwright checks pass, including the winner receipt at 360, 768 and 1280 pixels. Existing shared money/rule line coverage remains 100%.

The final Windows 11/Docker Desktop acceptance run measured:

| Check                                           | Result                    | Unchanged limit           |
| ----------------------------------------------- | ------------------------- | ------------------------- |
| 1,000 mixed lot closures                        | 79.736 seconds            | 10 minutes                |
| Durable Redis bid acceptance p95                | 14.23 ms                  | 50 ms                     |
| Redis update to 1,000 actual socket viewers p95 | 252.86 ms                 | 500 ms                    |
| 50-lot HTTP catalogue p95                       | 57.1 ms, four SQL queries | 100 ms, fixed query count |

The 1,000-lot fixture contains 20 funded wins and 980 no-bid results. Tests verify the exact aggregate wallet charge, zero remaining winning holds, paid invoice count and unsold count. Additional tests cover concurrent closer retries, final acceptance racing the freeze, stale soft-close schedules, additive maximum raises, losing-hold release, failure before capture and a crash after ledger postings, immutable frozen results, pickup-pass ownership, the 24-hour fallback and idempotent draft relisting. The real BullMQ scheduler calls the authenticated API; the receipt sender delivers branded HTML/plain text to Mailpit.

Full-suite phases run sequentially. An earlier realtime measurement under simultaneous production compilation exceeded its limit; after builds finished the full command passed without relaxing budgets or changing tests. Shortage/default tests inject a ledger-reported shortage because normal bids already reserve the full estimated total. All nine production workspace builds pass, including Android and iOS exports.

Staged source changes and full Git history passed the pinned Gitleaks scan. Real `.env` files, generated Prisma clients, build output, package stores and local test logs remain ignored. Existing historical exclusions were not broadened.

## Run locally in PowerShell

1. Start Docker Desktop and wait until it says the engine is running. Keep your existing private `.env` and Node 22/pnpm installation from [README](../README.md); do not replace your encryption keys.
2. Open PowerShell in the repository and run:

   ```powershell
   cd "C:\Users\bhoyee-pc\Desktop\auction-ng"
   pnpm install --frozen-lockfile
   docker compose up -d postgres redis meilisearch mailpit
   pnpm db:migrate
   docker compose build api
   docker compose up -d --no-build --wait --wait-timeout 180 web admin api realtime worker
   docker compose ps
   ```

   The new migration should apply once. Subsequent runs say there are no pending migrations. The app image is shared by the five server apps; build it once. The service list should show nine running, healthy services. These commands retain existing volumes and data.

3. Open the [buyer placeholder](http://localhost:3300), [admin placeholder](http://localhost:3301), [API documentation](http://localhost:4000/docs) and [local email inbox](http://localhost:8025). Ports 3000 and 3001 remain unused by this project. Search the inbox for “You won” to see synthetic receipts from the acceptance run.
4. To verify the code yourself:

   ```powershell
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   pnpm test:e2e
   ```

   Tests create and retain isolated databases and random Redis namespaces; they do not fund real accounts, reset application data or contact live payment providers. The local inbox receives only synthetic test mail.

## Release boundaries

`BIDS_ENABLED=false` remains the local setting. Enabling production bidding/settlement requires human money/bid review and the previously recorded provider, verification and recovery readiness work. The default bid namespace is not initialized by these isolated tests. Real email delivery remains unconfigured; non-local modes retain pending notifications. Email delivery is at least once on transport/commit uncertainty, while charges are idempotent. An obsolete unsent payment reminder is suppressed when payment/cancellation commits.

VAT remains the already approved provisional configurable rate, subject to accountant confirmation before launch. No buyer/admin/mobile product screens were added. Pickup booking, QR rendering/scanning and staff relisting screens remain later tasks. The next task is D01, the design system, which needs owner approval before T13 screens.
