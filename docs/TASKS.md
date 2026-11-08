# TASKS.md — Auction NG build plan

Place this file at `docs/TASKS.md`. Agents work on **one task per session**, in order, unless told otherwise.
Each task lists what it depends on, what to build, and how we know it's done.
Mark status as `[ ]` todo, `[~]` in progress, `[x]` done (with PR link).

Tasks marked **MONEY/BID** need human review before merge.

---

## Milestone 0 — Foundations

### [ ] T01 — Monorepo skeleton and local services

**Depends on:** nothing
**Build:**

- pnpm workspaces + Turborepo with the layout in AGENTS.md §3 (empty but runnable apps).
- `apps/web`, `apps/admin` (Next.js + Tailwind), `apps/api` (NestJS with `/health`), `apps/realtime` (Socket.IO server with `/health`), `apps/worker` (BullMQ boot), `apps/mobile` (Expo with expo-router, one screen).
- `packages/shared`, `packages/api-client`, `packages/ui`, `packages/config` (shared ESLint, TS, Tailwind configs).
- `docker-compose.yml` with postgres 16, redis 7, meilisearch; `.env.example`.
- All root scripts from AGENTS.md §4.
- GitHub Actions CI: install, lint, typecheck, test, build.
  **Done when:**
- `pnpm install && docker compose up -d && pnpm dev` starts every app; health endpoints return 200.
- The Expo app opens in Expo Go and shows a placeholder screen.
- CI passes on a fresh clone.

### [ ] T02 — Database schema and seed

**Depends on:** T01
**Build:**

- Prisma schema for: users, wallets, ledger_entries, virtual_accounts, payments, locations, categories, lots, lot_images, bids, watchlist, invoices, invoice_lines, fulfilments, notifications, strikes, audit_log, idempotency_keys.
- Money columns as integer kobo (`BigInt` for ledger amounts).
- Indexes: `lots(status, end_at)`, `bids(lot_id, amount_kobo desc)`, unique `ledger_entries(idempotency_key)`, unique `payments(provider, provider_ref)`.
- Seed: 1 location (Lagos hub), 12 categories, 200 lots with placeholder images, each published at a different time with its own run time (12–72 hours) so end times are spread around the clock, 20 buyers, 3 staff users.
  **Done when:** `pnpm db:migrate && pnpm db:seed` works on an empty database; schema reviewed against blueprint data model.

### [ ] T03 — Shared business rules (MONEY/BID)

**Depends on:** T01
**Build in `packages/shared`:**

- `money.ts`: kobo helpers, `formatNaira()`, safe integer checks.
- `auction-rules.ts`: increment table, `minNextBid()`, soft-close constants, run-time presets and limits (1 h – 7 days, default 24 h), `endAtFor(publishAt, duration)`, all configurable.
- `proxy.ts`: pure function `resolveBid(state, newBid) → newState` implementing AGENTS.md §6.
- `fees.ts`: buyer premium, lot fee, VAT, `estimatedTotal(max)`, invoice line calculation, rounding rules.
- Zod schemas for lot, bid, user, wallet DTOs.
  **Done when:** table-driven unit tests cover every increment boundary, every proxy-bidding case (first bid, outbid, tie, raise own max, below minimum), and fee rounding; 100% line coverage on these files.

---

## Milestone 1 — Accounts and wallet

### [ ] T04 — Auth: phone OTP and roles

**Depends on:** T02
**Build:** `SmsProvider` interface with Termii implementation and a console fake for dev; request-OTP and verify-OTP endpoints; Nigerian phone normalisation; access + refresh tokens; roles guard; rate limits on OTP; profile endpoints.
**Done when:** a user can sign up and log in with OTP in dev (OTP printed to console); OTP brute force is rate-limited; tests cover expiry, reuse and wrong-code attempts.

### [ ] T05 — Ledger and wallet service (MONEY/BID)

**Depends on:** T02, T03
**Build:** `apps/api/src/ledger` with operations `topup`, `hold`, `releaseHold`, `captureHold`, `debit`, `refund`, `payout` — each idempotent, transactional, with row locks; available vs held balance; wallet history endpoint.
**Done when:** tests prove no double-spend under 50 concurrent hold requests on one wallet; replaying any operation with the same idempotency key changes nothing; balances always equal the sum of entries.

### [ ] T06 — Paystack virtual accounts and top-up (MONEY/BID)

**Depends on:** T05
**Build:** `PaymentProvider` interface + Paystack implementation (test mode); consent + BVN capture flow; create Dedicated Virtual Account; webhook endpoint with signature check and transaction re-verification; credit via ledger `topup`; nightly reconciliation job comparing Paystack transactions with ledger entries.
**Done when:** a test-mode transfer credits the wallet exactly once even if the webhook is delivered three times; a forged webhook is rejected; reconciliation reports mismatches.

---

## Milestone 2 — Catalogue

### [ ] T07 — Lots, categories and images

**Depends on:** T02
**Build:** public endpoints for lot list (filters: category, location, ending soon, price range; cursor pagination), lot detail, categories; admin endpoints to create/edit lots; image upload to R2 with presigned URLs; generated thumbnail sizes.
**Done when:** list endpoint returns 50 lots in < 100 ms locally with a fixed number of queries; images are served as WebP thumbnails ≤ 30 KB.

### [ ] T08 — Search

**Depends on:** T07
**Build:** Meilisearch index for open lots, synced on create/update/close through the worker; search endpoint with typo tolerance and the same filters as the list.
**Done when:** searching "iphnoe" finds iPhone lots; a closed lot disappears from search within 10 seconds.

---

## Milestone 3 — Live bidding

### [ ] T09 — Bid engine in Redis (MONEY/BID)

**Depends on:** T03, T05
**Build:** Lua script implementing the full accept-bid path in AGENTS.md §6; loading open lots into Redis when an auction opens; `POST /lots/:id/bids` with idempotency key; wallet hold/release integration; Redis Stream for accepted bids.
**Done when:** Lua logic matches `resolveBid()` on 10,000 random property-based cases; 500 concurrent bidders on one lot never produce two leaders or a price below the rules; p95 accept time < 50 ms locally.

### [ ] T10 — Bid persistence worker (MONEY/BID)

**Depends on:** T09
**Build:** worker that reads the bid stream and writes `bids` rows idempotently; recovers after restart from the last acknowledged entry.
**Done when:** killing the worker mid-stream and restarting loses and duplicates nothing (tested).

### [ ] T11 — Real-time gateway

**Depends on:** T09
**Build:** Socket.IO gateway with Redis adapter; rooms per lot and per user; events `lot:update` (price, leader flag, endAt), `user:outbid`, `serverTime` on connect; auth on connect; shared client hook in `packages/api-client` with auto-reconnect and resubscribe.
**Done when:** a price change reaches 1,000 simulated viewers with p95 < 500 ms locally; a dropped connection resubscribes and shows the current price.

### [ ] T12 — Lot closing and invoicing (MONEY/BID)

**Depends on:** T10, T05
**Build:** scheduler that closes lots at `endAt` (respecting soft-close extensions); freezes winner in PostgreSQL; captures hold; creates invoice and invoice lines using `fees.ts`; creates pickup fulfilment with QR token; notifies winner; releases losers' holds; handles insufficient funds (24 h to pay, then strike and relist).
**Done when:** running the closer twice on the same lot charges once; 1,000 lots closing within 10 minutes all close correctly; tests cover no-bid lots, extended lots and failed captures.

---

## Milestone 4 — Buyer apps

### [ ] D01 — Design system in code (before any screen)

**Depends on:** T01 (can run in parallel with Milestones 1–3)
**Build:**

- `packages/ui/tokens.ts`: colours, type scale, spacing, radii, shadows from `docs/DESIGN.md`, exported for Tailwind (web/admin) and as a theme object (mobile).
- Load Schibsted Grotesk on web (next/font) and mobile (expo-font).
- Web components: Button (primary, secondary, ghost, danger; sizes), Input, OTP input, Naira amount input, Select, Chip/Badge (condition grades, statuses), Live pill, Countdown, Price (with flash on change), Lot card, Lot card skeleton, Bottom sheet/Dialog, Tabs, Toast, Empty state, Error state, Offline banner, Header, Footer.
- Mobile equivalents of the same components in `apps/mobile/components/ui`, using the shared tokens.
- A `/design` page in `apps/web` (dev only) and a hidden screen in the app showing every component and state with real-looking Nigerian data.
  **Done when:** every component on the `/design` page matches DESIGN.md, passes the §8 anti-"AI-generated" checklist, meets contrast and 44 px touch-target rules, and screenshots at 360/768/1280 px are attached to the PR. The business owner approves the look before T13 starts.

### [ ] T13 — Web buyer app

**Depends on:** T07, T11, T06, D01
**Design:** follow `docs/DESIGN.md` (home page structure §9, lot card and lot page §4, bidding UX §6) and any mockups in `docs/design/`. Build only from `packages/ui`.
**Build:** home (Ending soon, categories, deals), category and search pages, lot page with gallery, live price, countdown from server time, max-bid form with estimated total, watchlist, wallet page (account number, balance, history), invoices, pickup passes, auth screens. Edge-cached catalogue pages; live data over socket only.
**Done when:** Playwright covers sign-up → top-up (test mode) → bid → outbid → win → see pickup pass; Lighthouse mobile LCP < 2.5 s on the home page; works at 360 px; every screen has loading, empty, error and offline states; screenshots of each screen at 360/768/1280 px pass the DESIGN.md §8 checklist.

### [ ] T14 — Mobile app

**Depends on:** T13 (same API features), D01
**Design:** native feel (tab bar, sticky bid bar, bottom sheets, haptics on bid placed/outbid) while keeping the same brand as web. Follow `docs/DESIGN.md`.
**Build:** same flows as T13 in Expo; FlashList for lists; image caching; push notifications for outbid and win; secure token storage; data-saver toggle; deep links to lots.
**Done when:** Maestro flow covers sign-up → bid → win on Android; cold start < 3 s on a mid-range Android; EAS preview build installs on a real phone.

---

## Milestone 5 — Operations

The admin is built in eight smaller tasks. Every one follows `docs/ADMIN_DESIGN.md` and the mockups in `docs/design/admin-*.png`.

### [ ] T15a — Admin shell, staff auth, roles and permissions

**Progress (2026-11-07):** responsive grouped shell implemented over existing staff authentication/capabilities: 248px sidebar, 72px collapsed/tablet rail, mobile drawer and permission-filtered Ctrl/⌘K section finder. Inventory retains Categories/Pickup centres and pickup heading actions remain intact. Targeted shell screenshots are in `docs/design/admin-shell/`. Overview now has scoped record search; still open elsewhere: cross-record command search, authoritative live/environment indicators, sessions/invitation completeness and the expanded per-role endpoint audit. Do not mark T15a complete yet.
**Depends on:** T04, D01
**Build:** `apps/admin` layout shell (sidebar groups, top bar, Ctrl/⌘K command palette, environment badge); staff login with email + password and independently optional authenticator 2FA (required when enabled); permission registry (`lot.publish`, `refund.approve`, …) and built-in roles from ADMIN_DESIGN.md §2; server-side permission guard on every admin endpoint; Staff and roles pages (invite, deactivate, permission matrix, sessions); audit log writer used by every admin mutation.
**Done when:** each role sees only its nav items and gets 403 on forbidden endpoints (tested per role); role changes need a reason and appear in the audit log; enrolled accounts cannot bypass 2FA; enrollment remains optional per account.

### [ ] T15b — Admin UI kit and charts

**Depends on:** T15a
**Build in `packages/ui/admin`:** KPI card with sparkline, date range + compare control (URL state, WAT, Monday weeks), data table (saved views, filters with chips, column chooser, density, bulk bar, cursor pagination with 25 rows by default and a maximum of 50, export), detail drawer, status badge map, work queue widget, activity feed, confirm-with-reason dialog, approval dialog, chart wrappers (line, bar, stacked bar, horizontal bar, funnel, heatmap) on Recharts using the palette in ADMIN_DESIGN.md §4.3. A dev-only `/design` page in admin showing all of them with loading, empty and error states.
**Done when:** every component matches ADMIN_DESIGN.md; charts have tooltips and "View as table"; screenshots at 1280 and 1440 px attached.

### [ ] T15c — Analytics aggregates and metrics

**Actual-record Overview integration (2026-11-07):** implemented SQL-managed daily/category/bidder/outcome materialised read models, single-writer BullMQ refresh, ten-second operational snapshots and five-minute historical recomputation. Overview now uses the seeded application's records with static preview disabled. Eight widgets have actual sources; expenses and stock valuation remain unavailable. Exact financial/refund, distinct-bidder, permission, concurrency, one-year read-model and UI checks pass. Full registry/report dimensions, Redis live-stat production, large-history optimisation and production-volume benchmarking remain open. See `docs/specs/overview-real-analytics.md`.

**Depends on:** T12
**Build:** `packages/shared/src/metrics.ts` (every metric in ADMIN_DESIGN.md §6 with definition, good direction, format); `metrics_daily` table and worker jobs (every 5 min for today, nightly for yesterday); weekly/monthly/yearly roll-ups; `live_auction_stats` in Redis; admin metrics API (batched KPIs, series by grain, breakdowns by category/location/staff) reading from aggregates or a read replica only.
**Done when:** unit tests check each metric on fixture data; aggregates match a direct SQL calculation on seeded data to the kobo; the Overview API answers in under 300 ms with 1 year of seeded data.

### [ ] T15d — Overview dashboards

**Live monitor panel polish (2026-11-08):** fixed desktop column heights align Closing next with the Just closed bottom edge; closed outcomes show five rows with keyboard-accessible internal scrolling and up to fifty recent outcomes loaded. Virtualised live rows adapt to viewport height. Shared cards have restrained hover shadows/lift, solid chart-toggle/All hover states and a yellow/ink Unsold badge; reduced motion disables movement. Targeted responsive browser checks, admin types/lint and production build pass. Other T15d work remains open.

**Issues today (2026-11-08):** connected confirmed live-bid low-wallet rejections and automatic bid-hold release errors with per-WAT-day retry deduplication, source heartbeat/availability and explicit incident definitions. Connection recovery and confirmed late settlements retain their real sources. Card clarifies Nigerian day boundaries and delayed updates; silent refresh remains enabled. Targeted Redis and bid-funding integration/concurrency checks pass; no financial or bidding rule changed. **MONEY/BID CHANGE — needs human review.** T15d remains open for the other recorded work.

**Buyer foreground messages (2026-11-08):** added dismissible, tappable staff bidder-message banners on buyer web and mobile, with a full-message dialog and item link. Existing unread messages form a sign-in baseline; foreground checks fetch only the latest unread message every five seconds. Targeted tracker/database/browser tests and affected types/builds pass. Web captures at 360/768/1280 are in `docs/design/bidder-message-banner/`; native-device visual verification remains open. This does not complete T15d.

**Global controls and bidder messaging (2026-11-08):** implemented audited administrator pause/resume with typed confirmation, revision checks, durable receipts, atomic bid/purchase/closing/launch fences, full remaining-time restoration and recovery validation. Per-item messages use a durable encrypted fifty-recipient outbox and the existing in-app/email/push pipeline. Targeted concurrency, ledger/settlement/recovery and responsive browser checks cover these workflows. Individual lot controls and remaining telemetry keep T15d open. **MONEY/BID CHANGE — needs human review.** See `docs/specs/admin-live-monitor.md`.

**Live monitor refresh correction (2026-11-08):** failed socket-room joins retry automatically; price patches also reconcile the panels and browser focus triggers a silent refresh. Five-second fallback remains. Targeted browser validation confirms price changes and closed-row removal without navigation/reload. Remaining operational controls keep T15d open.

**Live monitor integration (2026-11-07, in progress):** implemented the logo-based shared shell, six cards, virtualised closing table, chart/table/CSV, independent panel states, protected socket room/endpoints, one-second worker, incremental Redis publication, immutable original run-time snapshots, reasoned/idempotent history audits and guarded demo seed/simulator. A local 400-bid sample accepted all bids with confirmation p95 15.66 ms; a separate 3,000-row check verifies bounded delta writes. Responsive screenshots are in `docs/design/admin-live-monitor/`. Operational controls, remaining telemetry, combined production-volume validation and final authenticated review remain open. See `docs/specs/admin-live-monitor.md`; do not mark T15d complete.

**Silent updates (2026-11-07):** widgets reconcile independently every five seconds while visible/online, react to staff socket/reconnect signals and preserve confirmed content and chart/table choices. Requests are coalesced; failed authorization clears protected snapshots. Five focused browser checks, lint, admin/UI types and admin build pass. Actual production aggregate integration is still pending T15c; this does not turn labelled demo fixtures into real business data.

**Overview correction (2026-11-07):** inline permission-scoped cross-record staff search, typed page shortcuts, right-aligned Export/check-in, compact WAT range/update line and avatar-only identity. Compare is hidden for now. Supported record search types and remaining full-text limitations are documented in `docs/specs/admin-overview-redesign.md`; production analytics remain open.

**Mockup redesign (2026-11-07):** implemented the complete five-row LotVanta visual preview, scoped Overview shell, URL-backed WAT controls, independent widget states, metric reports and accessible chart/table/CSV alternatives. Synthetic widget sources require explicit local deployment plus the demo flag and are visibly labelled. Real mode does not substitute fixtures or query hot money/bid tables. Production aggregates, live-stat producers, real report destinations and the one-year aggregate benchmark remain open in T15c/T15d. See `docs/specs/admin-overview-redesign.md` and `docs/design/admin-overview-redesign/`.
**Earlier interim iteration (superseded by the mockup redesign):** owner requested the Overview visual update while retaining current menus. Implement the new compact six-card hierarchy, paid-sales chart/table/CSV, live summary, inventory pipeline and permission-aware work queues using existing confirmed API fields. Keep the current fourteen-day sales window explicit. Net revenue/GMV, arbitrary date ranges/comparisons, category/funnel, expenses, activity widgets and role-specific analytics still depend on T15b/T15c and remain open; this visual update does not complete T15d.
**Depends on:** T15b, T15c
**Build:** role-based Overview (admin/ops, intake, warehouse, finance, support) per ADMIN_DESIGN.md §3, matching `admin-overview.png`; alert strip rules; Live monitor page with socket updates; Reports pages (Sales, Auctions, Inventory, Buyers, Finance, Operations, Support) with range, compare, grain, group-by, export and scheduled email reports.
**Done when:** each role's Overview loads in under 1.5 s with seeded data; numbers on screen equal exported numbers; widgets fail independently.

### [ ] T15e — Lots, intake, schedule and inventory batches

**Depends on:** T07, T15b
**Build:** Lots table + drawer + full page (matching `admin-lots.png`); mobile intake flow (camera, offline queue); bulk CSV import with validation report; label printing; Publish queue (run time per lot, publish now or later, end-time preview, chart of endings per hour with quiet-hours warning, scheduled publishes; run time locked after first bid); Inventory batches (supplier, cost, cost allocation to lots, recovery chart, aging).
**Done when:** a warehouse user can intake 20 lots in under 15 minutes on a phone; batch margin and recovery figures match hand calculations on fixtures.

### [ ] T15f — Orders, pickup desk and buyers

**Depends on:** T12, T15b
**Build:** Invoices list/detail; Pickup desk tablet screen (matching `admin-pickup.png`) with QR scan, ID check, per-item tick, problem report; Buyers list and 360° detail; strikes, suspension, fraud flags view.
**Done when:** an item cannot be marked collected without the ID check and all items ticked; every buyer action requires a reason and is audited.

### [ ] T15g — Finance: revenue, ledger, refunds, payouts, expenses, P&L, reconciliation (MONEY/BID)

**Depends on:** T05, T06, T15c
**Build:** Finance overview (matching `admin-finance.png`); ledger explorer (read-only); top-ups; refund/payout request → approve → pay workflow with threshold and separation of duties; `expenses` table with categories, receipts, budgets and approval; simple P&L; daily Paystack reconciliation with exceptions and day closing.
**Done when:** the requester cannot approve their own item (tested); refunds and payouts move money only through the ledger service; P&L lines reconcile to ledger and invoice totals on fixtures.

### [ ] T15h — Support tickets and disputes

**Depends on:** T15b, T15f
**Build:** three-pane ticket inbox with buyer context, categories, assignment, SLA timers, canned replies, internal notes; disputes linked to invoices that trigger the refund workflow; support analytics.
**Done when:** SLA breaches show in work queues; a dispute decision creates a refund request, never a direct refund.

### [ ] T16 — Pickup slots and storage rules

**Depends on:** T12, T15f
**Build:** pickup slot booking per location with capacity; reminders; storage after five centre working days, contact/review after ten working days, with notifications and the approved readiness/grace policy. Forfeiture and relisting remain blocked until refund rules are agreed.
**Done when:** slots cannot be overbooked; storage and review jobs are idempotent and tested; no forfeiture or relisting is enabled.

---

## Milestone 6 — Ship it

### [ ] T17 — Production Docker and deployment

**Depends on:** T13, T15a–T15g
**Build:** production Dockerfiles (multi-stage, non-root); production `docker-compose.yml` with Caddy; Coolify setup guide in `docs/deploy.md`; daily PostgreSQL backup to R2 and a tested restore script; health checks and restart policies.
**Done when:** a fresh VPS can be deployed by following `docs/deploy.md`; restore from last night's backup works.

### [ ] T18 — Observability

**Depends on:** T17
**Build:** Sentry in all apps; structured JSON logs; metrics for bid latency, socket connections, queue lag, closing lag; uptime checks; alert rules.
**Done when:** a forced error appears in Sentry within a minute; a dashboard shows bid p95 and queue lag.

### [ ] T19 — Load test the busiest hour

**Depends on:** T17
**Build:** k6 scripts: 5,000 viewers on one lot, 1,000 bids/s platform-wide, 1,000 lots closing in 10 minutes (worst case when many lots were published together), 24-hour soak test with lots ending continuously, run against staging.
**Done when:** budgets in AGENTS.md §7 hold on the staging VPS; results saved in `docs/load-tests/`.

### [ ] T20 — Security pass

**Depends on:** T17
**Build:** review of rate limits, auth, webhook handling, roles, secrets; dependency audit; fraud flags (shared devices/BVNs bidding on the same lot); withdrawal limits.
**Done when:** a separate review (fresh agent or human) finds no high-severity issues open.

### [ ] T21 — Private beta readiness

**Depends on:** T18, T19, T20
**Build:** terms, privacy policy and condition-grade pages (content from the business owner); invite-only sign-up; feedback button; admin report of daily sales and non-payment rate.
**Done when:** the full flow (top up → bid → win → pick up → refund) passes end to end five times in a row on staging with Paystack test mode.

---

## Phase 2 (after launch) — outline only

- T22 Partner delivery (`DeliveryProvider`, GIG Logistics quotes, booking, tracking webhooks)
- T23 Card payments and wallet withdrawals
- T24 Membership plan (lower premium, perks)
- T25 Buy-now and fast 60-second lots
- T26 WhatsApp notifications
