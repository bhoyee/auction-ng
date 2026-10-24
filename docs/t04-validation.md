# T04 validation

Implemented on `task/t04-email-auth` on 2026-10-24 in [PR #4](https://github.com/bhoyee/auction-ng/pull/4). The owner approved email codes with a local Docker test inbox instead of SMS for this task.

## Changes

- `apps/api/prisma/schema.prisma` and the new `20261024000200_email_auth` migration: optional paired phone fields, email verification timestamp, OTP challenges, hashed sessions and persistent rate counters. Existing data and the committed T02 migration are preserved.
- `apps/api/src/auth`: replaceable email delivery, transactional code verification/account creation, rotating opaque credentials, replay revocation, global authentication/role guards, web cookie/origin protection, own-profile endpoints, encrypted audit records and safe exception responses.
- `apps/api/src/app.ts`: integrates authentication, exact-origin CORS and typed OpenAPI schemas. API startup uses the existing tsx loader for runtime shared TypeScript schemas.
- `packages/shared/src/auth-schemas.ts`: canonical email handling, Nigerian phone normalization, strict authentication requests and public response contracts.
- `packages/api-client/src/auth.ts`: typed client for request/verify/refresh/logout/profile operations.
- `docker-compose.yml`, `.env.example`: local Mailpit v1.32.0 on loopback port 8025; explicit local-only auth configuration. No new npm dependencies or paid services.
- `scripts/check-auth.mjs`: a local-only end-to-end smoke check that prints neither OTPs nor credentials.
- `tests/auth.test.ts` and `apps/api/tests/auth-security.test.ts`: 21 new tests. Nest-specific tests remain inside the API workspace to respect isolated package resolution; root test discovery and typechecking include them.
- `scripts/run-tests.mjs`: separate fresh databases for schema/seed tests and auth tests. This prevents concurrent signup fixtures from affecting exact seed-count assertions. Both are deliberately retained, following the existing no-data-deletion policy.
- [Authentication specification](specs/authentication.md), [complete database dictionary](specs/database-schema.md), README and decisions explain setup, all columns/constraints/indexes and deferred integration work.

## Verification

- `pnpm lint`: passed after final formatting.
- `pnpm typecheck`: passed across all apps, packages and tests.
- `pnpm test`: 90 tests passed across 10 files, including 10 concurrent verifications of the same OTP, atomic sending limits, refresh races/replay, absolute expiry and concurrent profile audit consistency.
- The existing T03 rules/DTO coverage gate remains at 100% statements, branches, functions and lines. This is not a claim of 100% authentication implementation coverage.
- `pnpm build`: passed all nine production build tasks; unchanged web/admin/mobile artifacts were reused from valid Turborepo caches where applicable.
- Fresh migrations on the two isolated test databases and the additive migration on the existing local application database passed; schema dictionary tests verify every deployed table/column/constraint/index.
- Docker image builds on Linux and the real API/Mailpit email-capture, verify, profile, rotation and logout smoke check passed. The synthetic smoke account has verified email and an unverified phone; it receives no wallet funds.
- Gitleaks scanned all 18 commits before publication and found no secrets. `.env`, generated Prisma files, packages and build artifacts remain ignored.

## Limits and review

Review this security-sensitive change before merging. The pull request is stacked on the open T03 branch; T02/T03 still require their own money/bid review. No merges to `dev` or `main` are performed by this task.

This is backend and typed-client work. No login screens were built. Local messages are captured at `http://localhost:8025`, not sent to real inboxes. Production email delivery is intentionally unconfigured; authentication fails closed without explicit local mode. Staff/supplier email-only login is blocked rather than bypassing the required staff SSO/MFA. Those integrations and SecureStore use in mobile screens need later work.

Email verification does not satisfy the verified-phone bidding rule. Future phone verification must prove ownership before linking, and T09 must enforce bidding eligibility. The existing T03 notes refer to the future Redis bid engine as T07; the current task list correctly calls it T09. No live bidding work was included here.

Public rollout still requires production delivery, HTTPS and Secure cookies, explicit trusted proxies, retention/key-rotation policies and wallet-specific authorization. No real payment endpoints or ledger writes were added. No data was reset or removed.
