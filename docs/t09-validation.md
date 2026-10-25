# T09 — funded Redis bidding

**MONEY/BID CHANGE — needs human review.** [Draft PR #9](https://github.com/bhoyee/auction-ng/pull/9) is on `task/t09-bid-engine`, stacked on T08. The owner-approved [contract](specs/bid-funding-proposal.md), [API/recovery specification](specs/bidding.md) and [complete 28-table dictionary](specs/database-schema.md) describe the implementation. T10 and T12 are separate tasks.

## What changed

- `packages/shared/src/bid-schemas.ts` defines strict preparation/confirmation/result contracts, fee version, reservation lifetime and technical request limits; its package exports and database status vocabulary are updated.
- The three additive Prisma migrations and `schema.prisma` add immutable funding intents, wallet/hold/session/lot relations, safe integer checks, unique retry/hold constraints, lookup indexes and mandatory revocation fences. Buyer/time and partial namespace/UUID indexes cover preparation-rate queries and the rotating pending/retained scan. `document-schema.ts` regenerates every table's columns, PostgreSQL types, relations, indexes and constraints.
- `ledger-service.ts` adds transaction-scoped hold execution so an intent and its double-entry reservation commit together. The existing ledger validation, wallet locks, request fingerprints and reconciliation remain in that path.
- `apps/api/src/bids` implements funded proof publication, cached Lua acceptance, proxy/soft-close rules, exact retries, additive maximum raises, cancellation, bounded warming/cleanup and failure/revocation controls. `app.ts` wires the module; `auth-service.ts` fences refresh/logout. A paused engine leaves account/ledger reads available.
- `packages/api-client/src/bids.ts` provides the same typed API for web and mobile. No buyer/admin/mobile screens are added.
- `apps/worker/src/bid-worker.ts` schedules the secret-protected cleanup route through BullMQ; worker startup/health checks cover it when enabled. Only the API ledger module posts releases.
- `.env.example`, Compose, CI and `scripts/configure-bids.mjs` document/configure durable Redis and private maintenance credentials. The API reuses approved `redis@5.8.3`; other package versions are unchanged.
- The mandatory test runner uses separate functional, bid, search and catalogue phases. It creates a new isolated bid database and random Redis namespaces. Functional file concurrency is bounded at four; no tests, timeouts or performance assertions are skipped or relaxed.

## Validation

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and all nine Playwright checks pass locally. The full mandatory test command passes **215 tests**: 189 functional, 17 bid, eight real search and one catalogue performance check. The bid suite covers 10,000 shared/Lua comparisons, 500 simultaneous contenders, delta reservations, cross-lot spending, cancellation races, expiry, wrong device/token/key, suspension/logout fences, a real TCP dropped-reply recovery, typed HTTP access and real BullMQ release. Cached durable Lua acceptance measured p95 **33.08 ms** over 200 sequential requests in the final complete run on Windows/Docker Desktop, including the Redis response. This is an engine measurement, not an end-to-end mobile network measurement. Catalogue p95 is 34.8 ms with four SQL queries; the worker removes a closed search canary in 2,175 ms. Android and iOS production exports pass. The earlier green Linux implementation run measured bid p95 1.40 ms and catalogue p95 26.5 ms.

Preparation is measured separately: five sequential synthetic service preparations in an isolated test database had median **240.8 ms**, maximum **367.4 ms**. This small functional-fixture sample includes ledger/database work and proof publication, excludes HTTP/mobile network time, and is not a production latency guarantee. The 50 ms acceptance budget does not apply to preparation.

Both staged-change secret scans and the full branch-history Gitleaks scan pass. Existing exact historical synthetic-key exclusions were unchanged. No credentials, `.env`, build outputs or local tooling are published. The implementation passes both [PR Linux CI](https://github.com/bhoyee/auction-ng/actions/runs/40191061739) and [push Linux CI](https://github.com/bhoyee/auction-ng/actions/runs/40191058053). CI initially caught unstable formatting of generated multiline SQL constraints; the generator now emits single-line definitions, and immediate formatting checks pass without a second formatter run.

The rebuilt local image is running in all five app containers; PostgreSQL, Redis, Meilisearch and Mailpit are also healthy (nine services total). `pnpm auth:smoke` passes local email capture, sign-in, empty wallet/history, refresh and logout against Docker. Phone verification remains false. `pnpm bids:configure` was run twice and preserves its existing ignored token. Bidding remains disabled.

The first uncached script measurement was 60.43 ms and failed the unchanged 50 ms limit. Preloading the script with `SCRIPT LOAD` and using `EVALSHA` removed the repeated source transfer; the passing measurement retains AOF `appendfsync always`. Early runs also encountered transient Windows-to-Docker connection timeouts; those failures were not counted as successful validation.

## Run it in PowerShell

1. Install Docker Desktop and start it. Use the WSL 2 engine and Linux containers. Install the Node 22 version from `.nvmrc`, Git and pnpm 10.18.3 as described in the [main setup guide](../README.md). If this project already runs on your computer, keep your existing `.env` file.
2. Open PowerShell in `C:\Users\bhoyee-pc\Desktop\auction-ng` and install packages:

   ```powershell
   pnpm install
   ```

   You should see installation finish without an error. On a fresh clone only, copy `.env.example` to `.env`, then run `pnpm db:keys` as explained in the main guide. Never replace an existing encryption key or share `.env`.

3. Start the backing services and apply the new tables:

   ```powershell
   docker compose up -d --wait postgres redis meilisearch mailpit
   pnpm db:migrate
   pnpm bids:configure
   ```

   Docker should report healthy services. Migration output should finish with no pending migrations. The last command saves a private maintenance token to ignored `.env` without displaying it; it does not switch bidding on. Keep `BIDS_ENABLED=false` while persistence, settlement and review are pending.

4. Build/start the local app containers:

   ```powershell
   docker compose up -d --build --wait
   docker compose ps
   ```

   The nine Auction NG services should be running and healthy. Open <http://localhost:3300>, <http://localhost:3301> and <http://localhost:4000/docs>. The existing branded placeholders remain; Swagger now lists preparation, confirmation and cancellation. Bidding returns unavailable while disabled. Ports 3000/3001 remain untouched on your computer.

5. Run the automatic checks:

   ```powershell
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   ```

   Tests create synthetic users/funds only inside new test databases, then check the actual Redis Lua script and BullMQ worker. They do not place live bids, call Paystack or alter your application wallet. Wait for all four test phases to finish.

For the existing Android placeholder, keep your phone and computer on the same Wi-Fi, install Expo Go, run `pnpm --filter mobile start` in a second PowerShell window and scan its QR code using Expo Go. Allow Node on your private Windows network if prompted. T09 supplies backend/client contracts; the mobile bidding screen is T14 after design approval.

## Open boundaries

- Keep bidding disabled pending human money/bid review and T10/T12. No production bids or winner charging are claimed.
- An unexpected Redis restart/namespace loss requires reviewed reconciliation; automatic disaster recovery is not implemented. Never delete runtime rows or release uncertain holds to bypass this stop.
- Existing Paystack test-webhook acceptance, real R2 verification, phone-verification provider and staff SSO/MFA remain separate prerequisites. Email verification still cannot satisfy bidding's verified-phone requirement.
- Buyer screens, live Socket.IO delivery, bid-row persistence and invoice settlement are outside T09. No UI screenshot requirement is triggered by this backend-only change.
