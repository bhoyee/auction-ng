# T08 local setup and validation

T08 adds backend search on `task/t08-search`, stacked on T07. It does not add product screens or start T09. T06 Paystack and T07 R2 provider acceptance remain separate outstanding work.

All **198 tests** pass: 189 functional tests, eight real Meilisearch/Redis/BullMQ acceptance tests, and the mandatory catalogue performance test. Typo matching and actual worker create/update/close propagation pass; a closed lot was removed from the engine in **1,968 ms**, below the unchanged ten-second assertion. One and 50 search matches use the same four catalogue hydration queries. The catalogue HTTP gate measured **74.9 ms p95**, below its unchanged 100 ms limit. Test data stays in isolated databases, indexes and queues.

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (including fresh Android/iOS exports) and `pnpm test:e2e` all pass locally. The nine browser checks cover existing screens at 360/768/1280 px; this backend task adds no screen or layout. All eight migrations are applied locally without resetting data. The private token setup was run twice to verify it preserves an existing credential.

## Files

- `packages/shared/src/search-schemas.ts`: shared strict query/page contracts and queue limits.
- `packages/api-client/src/search.ts`: validated web/mobile search client.
- `apps/api/src/search/*`: Meilisearch REST boundary, asynchronous task handling, public search and private sync endpoints.
- `apps/api/src/catalogue/catalogue-service.ts`: batched authoritative hydration of engine-selected IDs.
- Prisma schema plus `20261025000400_search_outbox`: transactional lot-change outbox, sequence, trigger, constraints and pending index. The dictionary now lists every column/type, relation, unique/check constraint and index across all **26 tables**.
- `apps/worker/src/search-worker.ts`, worker bootstrap and health script: existing BullMQ infrastructure runs the two-second scheduler and closes its connections cleanly. The worker links the existing shared workspace package; no external dependency version changes.
- `scripts/configure-search.mjs`: repeatable private token generation in the ignored `.env` file, without printing secrets or replacing encryption keys.
- `.env.example`, Docker Compose and CI: private search settings, bounded indexing resources and real Meilisearch acceptance service.
- `apps/api/search-tests`, `vitest.search.config.ts`, test runner and root type-check inputs: a mandatory real-service acceptance phase, followed by the existing catalogue budget phase.

## PowerShell instructions

1. Start **Docker Desktop**. Use **Node.js 22.23.4** and **pnpm 10.18.3** as described in the README. Open PowerShell in the `auction-ng` folder. Preserve your existing ignored `.env` and encryption keys.
2. Run:

   ```powershell
   pnpm.cmd install --frozen-lockfile
   pnpm.cmd search:configure
   docker compose up -d --wait postgres redis meilisearch mailpit
   pnpm.cmd db:migrate
   docker compose up -d --build --wait
   ```

   Token setup should confirm it saved the credential without showing it. A repeated run should say it is already configured. Migrations should apply successfully without resetting data. Docker should report nine healthy services. Allow the worker a few seconds to initialize the index and process its pending batches.

3. Open **http://localhost:4000/docs** and try `GET /search`. Or run:

   ```powershell
   Invoke-RestMethod 'http://localhost:4000/search?q=iphnoe&limit=50'
   ```

   You should see `items`, `nextCursor` and `serverTime`. With only the safe draft seed, `items` is empty. Seeded demonstration stock is deliberately not offered for sale. The automated acceptance suite separately proves typo matching with isolated synthetic open lots.

4. Web/admin remain at **http://localhost:3300** and **http://localhost:3301**, with the existing branded placeholders. Mobile search screens remain a later task. The API/client contract is ready for all three applications.
5. To verify locally:

   ```powershell
   pnpm.cmd lint
   pnpm.cmd typecheck
   pnpm.cmd test
   pnpm.cmd build
   pnpm.cmd test:e2e
   pnpm.cmd auth:smoke
   ```

   Tests use new isolated PostgreSQL databases, isolated local Meilisearch indexes and a separate Redis queue name. They do not move real money, publish demo stock or delete application data. A stopped Meilisearch/Redis service should fail acceptance; tests are never silently skipped.

## Decisions and limits

Search orders matches by closing time and UUID for real keyset pagination. It filters starting prices and requires current open/closing status at the database boundary. No current bid price is fabricated. A short page during index catch-up can include a next cursor. See [the complete contract](specs/search.md).

The initial real-engine check exposed slow unbounded indexing allocation. Docker and CI now bound indexing memory/threads, and acceptance runs after the other concurrency suites. The original five-second per-task polling window, ten-second close assertion and 100 ms catalogue gate remain intact. Known asynchronous tasks are reused on retries.

Whole-volume search disaster recovery is a later operational task; pending event replay and ordinary process restarts are covered by the durable outbox. Staff SSO/MFA, R2 and Paystack configuration remain their previously documented limitations.
