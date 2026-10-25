# T07 validation and local setup

T07 implements the catalogue backend in [draft PR #7](https://github.com/bhoyee/auction-ng/pull/7) on `task/t07-catalogue`, stacked on T06. It does not start T08 or add product screens. Real R2 delivery remains an outstanding acceptance check, so the task stays in progress. Staff SSO/MFA is separately required before operational intake; it is not replaced by buyer login in this task.

The automated suite passes 190 tests: 189 functional tests across 20 files, followed by one mandatory performance test in its own process. The warmed 50-lot HTTP response measured p95 **64.4 ms** over ten requests locally, including typed response validation, with exactly **four SQL queries** for either one or 50 lots. The benchmark runs after the concurrency suites so they do not compete for PostgreSQL/CPU; it enforces the same 100 ms target without changing existing timeouts or disabling a check. Image tests use actual encoded photos and verify WebP output, metadata removal and the 30,000-byte ceiling. The initial fixture failures were corrected without weakening database constraints or checks.

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm test:e2e` pass. The nine browser checks cover the existing placeholders and sign-in email at 360/768/1280 px; no new screen needs design approval in T07. The local database has all seven migrations applied without a reset. Incoming upload signing follows R2's checksum compatibility: the expected digest is signed metadata and completion independently verifies the file bytes.

## What changed

- `packages/shared/src/catalogue-schemas.ts`: strict shared list/detail/draft/upload contracts, integer-kobo filters, cursor limits and image rules.
- `packages/api-client/src/catalogue.ts`: typed public and staff clients for every catalogue endpoint.
- `apps/api/src/catalogue/catalogue-controller.ts`: public browsing and admin/intake routes, Swagger, input validation, role enforcement and mutation rate limits.
- `catalogue-service.ts`: deterministic keyset pagination, batched relation queries, draft-only optimistic edits, encrypted audit records and checksum-bound upload intents.
- `image-store.ts`: R2 S3 presigning and separate private/public buckets; no API credentials reach clients.
- `image-processing.ts`: strict photo decoding, metadata stripping, rotation, bounded WebP sizes and thumbnail byte enforcement.
- Prisma schema and new `20261025000300_catalogue_images` migration: upload intents, completed-image metadata, indexes, checks and restrictive foreign keys. Previous migrations remain untouched. [The dictionary](specs/database-schema.md) lists all 25 tables and every column/type, relation, index and unique/check constraint.
- Existing API bootstrap, auth limiter and database query instrumentation support the module. Buyer authentication remains unchanged; staff SSO/MFA is not bypassed.
- `.env.example`, Compose and the API manifest/lockfile: R2 settings and the owner-approved pins `@aws-sdk/client-s3@3.1156.0`, `@aws-sdk/s3-request-presigner@3.1156.0`, `sharp@0.35.5`.
- Tests cover public visibility, filters, equal-time pagination, fixed query counts, the 100 ms budget, roles, audit, stale edits, upload ownership/retries/expiry/checksums, signing, corrupt/animated/oversized input and actual WebP output.

## Run it on Windows

1. Install and start **Docker Desktop**. Install **Node.js 22.23.4** and **pnpm 10.18.3** using the [README setup](../README.md). Git is needed only to clone or switch branches. Keep the existing ignored `.env`; do not replace it or regenerate its encryption keys.
2. Open the `auction-ng` folder in PowerShell and run:

   ```powershell
   pnpm.cmd install --frozen-lockfile
   docker compose up -d --wait postgres redis meilisearch mailpit
   pnpm.cmd db:migrate
   pnpm.cmd db:seed
   docker compose up -d --build --wait
   ```

   Migrations should finish successfully. The seed is additive and leaves wallets empty and demo lots in draft. Compose should report healthy services; it preserves existing volumes and uses ports 3300/3301 for web/admin.

3. Open **http://localhost:4000/docs** to inspect and try public catalogue endpoints. In PowerShell:

   ```powershell
   Invoke-RestMethod 'http://localhost:4000/categories?limit=50'
   Invoke-RestMethod 'http://localhost:4000/locations?limit=50'
   Invoke-RestMethod 'http://localhost:4000/lots?limit=50'
   ```

   You should see the seeded categories and Lagos demo hub. Lots should be empty when only the safe draft seed exists. That is expected: the API does not publish demonstration stock as real auctions. Responses include a `nextCursor` when another page exists.

4. **http://localhost:3300** and **http://localhost:3301** still show branded placeholders. Catalogue screens and the admin intake interface are later tasks. The Expo app still uses the existing mobile placeholder; no new screen is added here.
5. Run verification if desired:

   ```powershell
   pnpm.cmd lint
   pnpm.cmd typecheck
   pnpm.cmd test
   pnpm.cmd build
   pnpm.cmd test:e2e
   pnpm.cmd auth:smoke
   ```

   Tests create new isolated PostgreSQL databases and synthetic test records. They do not fund demo wallets, publish seeded lots or call real payment services. No database reset or volume deletion is needed.

## Remaining acceptance

- Configure real R2 buckets, scoped credentials, custom domain and CORS as described in [the catalogue contract](specs/catalogue.md#r2-configuration-and-acceptance), then prove an actual private upload and public WebP delivery under 30,000 bytes. No real R2 credentials are configured by this task.
- Staff SSO/MFA is still unconfigured. Buyer email login must continue to reject staff; protected intake endpoints cannot be used operationally until proper staff authentication exists. Automated HTTP tests use a test-process-only identity substitution.
- No public auction publishing endpoint is added. Scheduling, the live bid state and the lot lifecycle remain their own tasks.
- T06's actual Paystack sandbox checks remain pending independently. Do not mark T06 complete or merge its draft PR based on catalogue tests.

Decisions and contracts are recorded in [decisions.md](decisions.md) and [catalogue.md](specs/catalogue.md).
