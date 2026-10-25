# Buyer-selected bid modes

**MONEY/BID CHANGE — needs human review.** This is the owner-approved amendment to T09, before T10 persistence. No new dependencies, buyer screens or payment-provider calls are added. The complete interaction rules are in [the bidding contract](specs/bidding.md#owner-approved-bid-choices).

## Changes

- `packages/shared/src/auction-rules.ts`, `bid-schemas.ts`, `schemas.ts` and `proxy.ts`: one shared mode vocabulary, direct default, strict preparation/receipt validation, direct pricing and optional automatic limits. The existing typed bid client consumes these contracts for both web and mobile.
- `apps/api/src/bids/bid-service.ts`, `bid-lua.ts` and `bid-controller.ts`: bind mode to the funded preparation and retry fingerprint, return it in the buyer's receipt, document it in OpenAPI, and resolve both modes atomically in Redis. Accepted events record the selected mode. Existing funding, revocation, release and soft-close safeguards remain in force.
- `apps/api/prisma/migrations/20261025000800_bid_modes/migration.sql` and `schema.prisma`: add immutable `bid_mode varchar(16)` with an allowed-value check. Existing intents retain automatic semantics; new API intents explicitly store their selected/default direct mode. Existing relations, indexes and unique constraints remain applicable; this adds no new query pattern or index.
- `tests/bid-modes.test.ts`, shared tests and the real Redis/funding tests: cover the direct default, opt-in automatic mode, interactions, ties, minimum increments, own raises, immutable mode, replay safety, legacy proofs, concurrent mixed bids and wallet release.
- `AGENTS.md`, `docs/blueprint.md`, `docs/decisions.md`, `docs/specs/bidding.md`, `docs/specs/database-schema.md` and `docs/TASKS.md`: record the approved rule change and document every database column, type, relation, constraint and index.

## Run in PowerShell

Keep Docker Desktop running. Use the existing Node 22 and pnpm installation described in [README](../README.md), and keep your existing private `.env`.

```powershell
pnpm install --frozen-lockfile
docker compose up -d postgres redis meilisearch
pnpm db:migrate
pnpm db:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Migration should report `20261025000800_bid_modes` applied, or no pending migrations. Checks should finish successfully. The test runner creates isolated synthetic databases and retains them; it does not reset your application database or contact Paystack.

The existing preparation API accepts either example below. Generate a fresh UUID for each new preparation and use your authenticated bearer token and installation header. Confirmation uses the returned preparation ID and original retry key; it cannot override the selected mode.

```json
{ "maxKobo": 500000, "mode": "direct", "idempotencyKey": "<new UUID>" }
```

```json
{ "maxKobo": 1000000, "mode": "automatic", "idempotencyKey": "<new UUID>" }
```

These represent a ₦5,000 direct offer and a private ₦10,000 automatic limit, before fees. Omitting `mode` means direct. Wallet funds must cover the returned total before either preparation is accepted.

## Validation results

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. The full mandatory suite passes 230 tests: 201 functional, 20 bid, eight real search and one catalogue performance check. Shared money/rule files retain 100% line coverage. Redis matches 10,000 deterministic mixed-mode rule cases; 500 simultaneous mixed-mode contenders retain one leader and one active funding group. Durable acceptance p95 is 16.58 ms across 200 requests on this Windows/Docker Desktop machine, below 50 ms. This measures the Redis acceptance command, not mobile-network latency.

The migration and regenerated dictionary pass the live PostgreSQL schema checks. A mode change on an existing funding intent is rejected, a changed-mode retry conflicts, losing direct holds release once, and legacy proofs remain automatic. The initial new rule tests failed for the missing direct behaviour before implementation; the first full-suite run caught stale database documentation, which was regenerated before the complete passing rerun.

## Release boundary

Keep `BIDS_ENABLED=false`. The later persistence, realtime, settlement and buyer-screen tasks remain pending. The buyer-facing selector is therefore not yet visible in the web/mobile placeholder apps. Old proxy-only API instances must not run alongside this version while accepting bids. Existing automatic limits cannot be lowered or cancelled by selecting direct mode; own new amounts must exceed the existing commitment.
