# T05 validation

Implemented on 2026-10-24 on `task/t05-wallet-ledger`, stacked on the open T04 branch. **MONEY/BID CHANGE — needs human review** before merge. T06 has not started.

## Changes

- `apps/api/prisma/schema.prisma` and migration `20261024000300_wallet_ledger`: durable wallet reservations, journal operation/fingerprint/delta metadata, ownership foreign keys, pagination indexes and deferred funds/posting guards. Additive migration; no database reset or edits to previous migrations.
- `apps/api/src/ledger/ledger-service.ts`: seven idempotent transactional operations, fixed lock order, derived available/held balances, capped refunds, actual-total capture with immediate unused-hold release and cursor history.
- `ledger-errors.ts`, `wallet-controller.ts`, `app.ts` and the safe exception filter: protected buyer wallet opening/read endpoints, Swagger and central safe domain errors. No public money-moving routes.
- `packages/shared/src/wallet-schemas.ts` and database vocabulary: strict shared commands and wallet/history contracts; `packages/api-client/src/wallet.ts`: typed validated client for web/mobile.
- Ledger and wallet API tests: operation replay, money boundaries, ownership, API validation, rollback, SQL guards and independent-instance concurrency. Invalid ledger fixtures live only inside the ledger module and require an isolated test database.
- `scripts/run-tests.mjs`: separate fresh ledger database in addition to schema/auth databases. `scripts/check-auth.mjs`: local email-to-empty-wallet smoke check without crediting funds or printing credentials.
- Database documentation generator/dictionary, wallet specification, README, decisions and task status updated.

## Checks

- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: 118 tests passed in 13 files. Existing shared rule modules retain 100% line/branch coverage; this is not a claim of 100% API coverage.
- Concurrency: 50 independent hold requests across two service instances against 10,000 kobo allowed exactly ten 1,000-kobo reservations; the other 40 were rejected for insufficient funds. Fifty duplicate top-ups produced one journal. Concurrent refunds never exceeded the original charge; capture/release settled only once.
- Rollback: exceeding the safe total balance leaves no journal or consumed idempotency key; retry succeeds when room is available. Deferred PostgreSQL guards reject overdrafts, orphan holds and posting/metadata mismatches.
- `pnpm build`: passed for all apps/packages, including both Expo exports; unchanged tasks may use Turborepo cache.
- `pnpm test:e2e`: nine existing browser checks passed at 360/768/1280 px. No new UI screens are part of T05.
- `pnpm db:docs`: generated all 24 deployed application tables, columns/types, relations, indexes and constraints.

## Local check in PowerShell

Open Docker Desktop and wait until it says the engine is running. Open PowerShell in the project folder. Node 22 and pnpm must be installed as described in the README.

```powershell
pnpm.cmd db:migrate
docker compose up -d --build --wait
pnpm.cmd auth:smoke
docker compose ps
```

The smoke check should say `Local email capture, sign-in, empty wallet, history, refresh and logout passed. Phone remains unverified.` It creates a synthetic buyer and an empty wallet, never wallet funds. The service list should report healthy containers. The website remains at http://localhost:3300, admin at http://localhost:3301, API documentation at http://localhost:4000/docs and local email inbox at http://localhost:8025. Wallet product screens come later; the API supports both buyer clients.

## Open integration work

Human review is still required for this money change and the stacked earlier money PRs. Paystack proof, consent/BVN, virtual accounts and reconciliation are T06. Bid-engine reservations and invoicing are later tasks. Payout currently books an internal movement only; provider execution, withdrawal authorization, reversals and limits are not implemented. No live payment endpoints or real customer emails were used. Balance aggregation has no cache yet; T09 must preserve its Redis-only acceptance path.
