# T03 validation

Implemented on `task/t03-shared-rules` on 2026-10-24 in [PR #3](https://github.com/bhoyee/auction-ng/pull/3).

## Delivered

- `packages/shared/src/money.ts`: safe integer checks, exact ledger conversion, overflow-safe addition and Naira formatting.
- `auction-rules.ts`: frozen configurable increment tiers, minimum next bid and server-time soft close.
- `proxy.ts`: pure proxy resolution, first bid, outbid, ties, own-max raises, minimum rejection and capped integer price calculation.
- `fees.ts`: configurable premium/lot fee/VAT, exact half-up charge rounding and estimated totals.
- `schemas.ts`: strict lot, bid, user and wallet DTOs using the existing shared statuses and roles.
- `tests/shared-rules.test.ts`, `tests/shared-schemas.test.ts`: 43 new tests; 69 total repository tests. Cases include all increment boundaries, repeated soft close, immutable input states, unsafe values, overflow, private-field rejection and exact fee rounding.
- `vitest.config.ts`, root package and lockfile: approved V8 coverage dependency, enabled by the existing `pnpm test` command with 100% per-file line thresholds.
- [Rule contracts](specs/shared-rules.md) and decisions log explain rounding and integration assumptions.

## Checks

- `pnpm lint`: passed.
- `pnpm typecheck`: passed across the repository.
- `pnpm test`: all 69 tests passed, including existing PostgreSQL ledger and concurrent-seed tests. Shared rules and DTO files reached 100% statements, branches, functions and lines.
- `pnpm build`: all nine build tasks passed, including Next.js web/admin and Expo Android/iOS exports.
- All eight local Docker services remain healthy; no app or database service was reset.
- Gitleaks scanned all 13 commits before publication and found no secrets. `.env` and generated artifacts remain ignored.

## Review boundaries

**MONEY/BID CHANGE — needs human review** before merge.

This is pure shared logic: no live payment endpoints, ledger operations, API endpoints, UI screens or database migrations were added. No new environment variables are required. VAT remains provisional at 7.5%, configurable and awaiting accountant confirmation before launch.

T02 remains an open dependency for the existing shared persistence values and test setup. The T03 pull request is based on its branch so reviewers see only T03 changes; retarget to `dev` after T02 merges. Neither task is automatically merged.

Concurrency and latency of live bid acceptance belong to T07's atomic Redis Lua implementation. Pure calculations do not introduce shared mutable state, and this task makes no claim that the future live bid engine has passed load or concurrency tests. T04 has not started.
