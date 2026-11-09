# T10 — Bid persistence worker

**MONEY/BID CHANGE — needs human review.** This task records accepted bids and recovers pending deliveries after worker restart. It adds no screens, live payment calls, ledger writers, lot closing or invoices. Bidding remains disabled. See [the persistence contract](specs/bid-persistence.md) and [complete database dictionary](specs/database-schema.md).

## Files and behaviour

- `packages/shared/src/bid-persistence.ts` and its package export define strict accepted-event, internal batch and receipt schemas, the namespace/group and worker intervals. `bid-service.ts` uses the shared namespace constant without changing the Lua acceptance path.
- `apps/api/src/bids/bid-persistence.ts` validates original stream entries against funded proofs/intents, atomically persists an immutable outcome receipt and request/counter bid rows, and verifies complete existing rows on replay. `bid-service.ts` and `bid-controller.ts` expose the guarded private worker route. Worker callers supply IDs only; they cannot submit bid amounts or a namespace.
- `apps/api/prisma/migrations/20261025000900_bid_persistence/migration.sql` and `schema.prisma` add the receipt table, optional bid receipt/role relation, unique keys, check constraints, supporting indexes and immutable-history triggers. Existing ledger/funding rows are unchanged. `document-schema.ts` and the generated dictionary cover all 29 tables, columns, types, relations and constraints.
- `packages/api-client/src/bid-persistence.ts`, its exports and package metadata provide a narrow internal client for Node, including strict receipt checks and private-address validation. The worker links this existing workspace package; no external dependency versions change. `pnpm-lock.yaml` adds only that workspace link.
- `apps/worker/src/bid-persistence-worker.ts`, `main.ts` and `scripts/check-worker.mjs` start, monitor and close the stream consumer alongside existing maintenance. The group reads historical backlog, reclaims pending entries and acknowledges only committed receipts. No source events/groups are trimmed or deleted.
- `apps/api/tests/bid-persistence.test.ts`, its child-process fixture, the bid-suite config and functional-suite exclusion exercise real Redis, PostgreSQL and BullMQ in the existing mandatory test runner. `tests/database.test.ts` requires the new schema. `.env.example`, task/decision records and specifications document the new credential use and recovery boundary.

## Validation

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. The mandatory test suite passes **235 tests**: 201 functional, 25 bid, eight real search and one catalogue performance check. Shared money/rules retain 100% line coverage. The full existing rule/concurrency suite remains enabled: 10,000 deterministic Lua comparisons, 500 simultaneous mixed-mode bidders and acceptance p95 **11.72 ms** over 200 durable Redis requests on Windows/Docker Desktop. This is engine latency, not mobile-network latency.

The five new persistence tests cover ten simultaneous retries, immutable rows, unchanged wallet balances, a losing request plus its automatic counterbid, unknown IDs, strict private-route authentication/body validation, forged-batch rejection and two real process-kill recovery cases. The latter use an HTTP barrier to stop the actual worker before database commit or after commit but before Redis acknowledgement; the restarted process reclaims pending work and finishes with every fixture receipt exactly once and zero pending entries. Test data is isolated and retained rather than deleting/resetting user data.

Type checks initially exposed a browser-client import boundary; the dedicated internal client export fixes it without broadening worker types or adding external libraries. Existing normal Prisma stderr output is separated from native exit-code checks in local command logging.

## Run it in PowerShell

1. Start Docker Desktop using Linux containers. Keep your existing `.env` private. Use the pinned Node 22 and pnpm versions from [README](../README.md).
2. Open PowerShell in the repository and install the existing dependencies:

   ```powershell
   pnpm install --frozen-lockfile
   docker compose up -d postgres redis meilisearch
   pnpm db:migrate
   pnpm db:generate
   ```

   Migration should apply `20261025000900_bid_persistence`, or report no pending migrations. It does not reset wallets or seed money.

3. Run the checks:

   ```powershell
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   ```

   All commands should succeed. `pnpm test` performs the worker crash tests automatically against newly created synthetic databases and random Redis namespaces.

4. To rebuild and view the local applications:

   ```powershell
   docker compose build api
   docker compose up -d --no-build --wait web admin api realtime worker
   docker compose ps
   ```

   Services should become healthy. Open the buyer placeholder at <http://localhost:3300>, admin at <http://localhost:3301>, and public API documentation at <http://localhost:4000/docs>. The persistence route is private and excluded from buyer Swagger.

Keep `BIDS_ENABLED=false`: worker persistence is complete, but real-time buyer screens, reviewed closing/settlement and production recovery procedures are still required before accepting real bids. Do not delete Redis groups/proofs or change runtime identities to bypass a paused engine. T11 and T12 remain separate tasks.
