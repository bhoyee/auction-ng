# T15 — LotVanta staff dashboard

Status: discovery and implementation plan, 2026-11-05. Owner requests completion of T15 with a professional dashboard, three core roles (Admin, Manager, Support), administrator-created custom roles, configurable capabilities and soft deletion with admin-only permanent deletion. T15 remains incomplete until functional, security, performance and visual acceptance pass.

## Existing implementation

Staff email/password plus mandatory authenticator sign-in, security settings, Top Deals curation, scheduling controls, wallet switches, fee configuration, pickup queue/scan flow, support desk and paid cancellation approval already exist in varying stages. Preserve their authoritative APIs and money/auction behaviour. Current access uses fixed role decorators and service-level role checks; replace authorization consistently rather than only hiding menu links.

## Files and implementation order

1. `packages/shared/src/staff-permissions.ts`, `staff-admin-schemas.ts`, `admin-dashboard-schemas.ts`: validated permission vocabulary, core-role defaults, safe administrative inputs and typed dashboard/list contracts. Keep amounts in kobo and distinguish sales totals from service-charge earnings and buyer wallet funds.
2. New additive Prisma migrations and `apps/api/prisma/schema.prisma`: staff roles, role permissions, assignments/revisions and entity-specific archival metadata with indexes. Update `docs/specs/database-schema.md` with every column/type/relation/index/unique constraint. Preserve immutable historical records.
3. `apps/api/src/auth/` and new `apps/api/src/staff-admin/`: capability guard, server-side authorization for every affected operation, account/role management, immediate permission/session invalidation, audit records and protection against removing the last active administrator. Mandatory staff MFA remains.
4. `apps/api/src/admin-dashboard/` and `packages/api-client/src/`: bounded actual-data summaries/charts, cursor-backed operational lists, cataloguing, CSV validation/import, audit reads and archive/restore actions. No fabricated stats or unbounded list queries.
5. `apps/admin/app/` and `packages/ui/web/`: shared staff session/layout/sidebar; Overview, Inventory, Auctions, Pickup, Buyers, Support, Finance, Staff and roles, Audit and Trash. Consistent compact tables, filters, keyboard-operable row actions and responsive detail drawers. Build token-based SVG charts with text/table alternatives; no new chart/UI dependency.
6. `apps/api/src/ledger/` and existing financial services: implement only the approved refund policy, with transaction locks, original invoice linkage, refundable-balance limits, immutable entries, idempotency and audit reasons. No UI-only or direct balance edits.
7. Focused unit/integration/permission/concurrency tests; affected API/admin/shared/client type and lint checks; admin/API production builds; Playwright workflow and 360/768/1280 screenshot review. Verify intake throughput against 20 lots in 15 minutes before marking T15 complete.

## Dashboard direction

Compact indigo navigation with clear grouping, white work surfaces and restrained borders, Schibsted Grotesk, existing LotVanta logo/tokens, clear active/hover/focus states and a responsive mobile drawer. Overview should prioritize actionable operational data: open/scheduled/unsold lots, paid sales, pickup backlog and support backlog; show real sales/auction trends and condition/status distribution only when the viewer has permission. No invented trend deltas, business revenue claims, buyer-identifying chart tooltips or decorative empty charts. Every section needs loading, empty, error/offline and confirmed-success states. Persist filters in navigation and silently reconcile authoritative data.

## Owner-approved decisions

- Permanent deletion: recommend admin-only removal of unused drafts/unreferenced setup records. Archive/restore linked lots/accounts; do not erase bids, ledger, payments, invoices, pickup receipts or audit history. This respects AGENTS.md sections 5 and 10 and avoids broken transaction evidence.
- Default Manager: recommend inventory, auctions and pickup operations. Support: tickets and buyer assistance. Admin initially controls role/staff administration, fee settings, refunds and payout approvals. Custom roles may receive explicitly delegated capabilities, excluding permanent deletion and root administration.
- Refunds: recommend staff-approved purchase refunds credited to the buyer wallet with required reason and double-refund protection; original-method provider refunds remain separate unless explicitly approved.

The owner approved all three recommendations before implementation. Legacy intake, warehouse and finance accounts retain their narrow defaults; existing admin/support memberships are backfilled and Manager is added without broadening old roles.

## Implementation and verification progress

The capability model, additive schema, staff setup/roles, searchable cursor lists, archival checks, ledger-backed invoice refunds and dashboard UI are implemented. New refund notifications use the existing encrypted notification queue, in-app inbox and push worker. Setup links expire after 24 hours, are single-use and can be reissued only for suspended, unenrolled staff; reissue invalidates earlier links.

Focused tests cover CSV validation, permission boundaries, MFA sessions, stale role changes, invitation invalidation, scope-bound pagination, archival safety and concurrent refund retries/competing keys. Production admin/API builds and responsive fixture-based browser checks are being completed. The database dictionary is generated from the migrated isolated test database, not hand-written guesses.

Still required before marking T15 done: affected existing integration suites, actual intake/photo/pickup workflows, 20-lot throughput acceptance, final responsive review and operational rollout. Browser fixtures demonstrate layout only; they do not prove live API, R2 uploads or real staff enrollment.

## Review requirement

MONEY/BID CHANGE — needs human review. Staff authorization, archival eligibility, suspension and refunds can affect access to money and bids. Keep existing Redis admission/revocation fences and immutable settlement rules; tests must cover races and privilege escalation. No live provider operations or production data deletion during development.

Owner amendment 2026-11-05: optional individual staff/admin 2FA replaces mandatory enrollment. Setup links and initial operator setup create password-only accounts; Account security controls enrollment/disable with existing proof checks. Existing enrolled staff retain their setting.
