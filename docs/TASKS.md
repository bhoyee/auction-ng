# TASKS.md — Auction NG build plan

Place this file at `docs/TASKS.md`. Agents work on **one task per session**, in order, unless told otherwise.
Each task lists what it depends on, what to build, and how we know it's done.
Mark status as `[ ]` todo, `[~]` in progress, `[x]` done (with PR link).

Tasks marked **MONEY/BID** need human review before merge.

---

## Milestone 0 — Foundations

### [x] T01 — Monorepo skeleton and local services

Completed locally on 2026-10-23 on `task/t01-monorepo`. [Validation and limitations](t01-validation.md); [reviewed screenshots](design/t01/README.md). [Publication PR #1](https://github.com/bhoyee/auction-ng/pull/1) tracks the owner-approved publication from `dev` into `main` and its GitHub CI checks. The original database stubs are replaced by T02.

Local Docker follow-up: all five server apps now run alongside the three backing services. Use `docker compose up -d --build --wait`; buyer/admin are available on host ports 3300/3301 to avoid the local VPN on 3000.

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

### [x] T02 — Database schema and seed

Implemented on 2026-10-24 in [PR #2](https://github.com/bhoyee/auction-ng/pull/2), targeting `dev`. [All tables, columns/types, relations and constraints](specs/database-schema.md); [validation and review notes](t02-validation.md). **MONEY/BID CHANGE — needs human review** before merge. T03 has not started.

**Depends on:** T01
**Build:**

- Prisma schema for: users, wallets, ledger_entries, virtual_accounts, payments, locations, categories, lots, lot_images, bids, watchlist, invoices, invoice_lines, fulfilments, notifications, strikes, audit_log, idempotency_keys.
- Money columns as integer kobo (`BigInt` for ledger amounts).
- Indexes: `lots(status, end_at)`, `bids(lot_id, amount_kobo desc)`, unique `ledger_entries(idempotency_key)`, unique `payments(provider, provider_ref)`.
- Seed: 1 location (Lagos hub), 12 categories, 200 lots with placeholder images and staggered end times, 20 buyers, 3 staff users.
  **Done when:** `pnpm db:migrate && pnpm db:seed` works on an empty database; schema reviewed against blueprint data model.

### [~] T03 — Shared business rules (MONEY/BID)

Implementation on `task/t03-shared-rules`; [rule contracts and integration boundaries](specs/shared-rules.md). MONEY/BID CHANGE — needs human review before merge.

**Depends on:** T01
**Build in `packages/shared`:**

- `money.ts`: kobo helpers, `formatNaira()`, safe integer checks.
- `auction-rules.ts`: increment table, `minNextBid()`, soft-close constants, all configurable.
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

### [ ] T15 — Admin dashboard

**Depends on:** T07, T12, D01
**Design:** same tokens and components as the buyer site, denser layout (tables, keyboard shortcuts), designed for a phone in the warehouse as well as a desktop.
**Build:** staff login with roles; lot intake (phone camera upload, condition grade, retail price), bulk CSV import; auction scheduling with staggered end times; pickup desk (scan QR, show lots and bin, mark collected); refunds (through ledger, with reason); users (strikes, suspend); audit log viewer.
**Done when:** a warehouse user can intake 20 lots in under 15 minutes; every admin action appears in the audit log; roles block access correctly (tested).

### [ ] T16 — Pickup slots and storage rules

**Depends on:** T12, T15
**Build:** pickup slot booking per location with capacity; reminders; storage fee after 5 days, forfeit after 10 (configurable), with notifications.
**Done when:** slots cannot be overbooked; storage fee and forfeit jobs are idempotent and tested.

---

## Milestone 6 — Ship it

### [ ] T17 — Production Docker and deployment

**Depends on:** T13, T15
**Build:** production Dockerfiles (multi-stage, non-root); production `docker-compose.yml` with Caddy; Coolify setup guide in `docs/deploy.md`; daily PostgreSQL backup to R2 and a tested restore script; health checks and restart policies.
**Done when:** a fresh VPS can be deployed by following `docs/deploy.md`; restore from last night's backup works.

### [ ] T18 — Observability

**Depends on:** T17
**Build:** Sentry in all apps; structured JSON logs; metrics for bid latency, socket connections, queue lag, closing lag; uptime checks; alert rules.
**Done when:** a forced error appears in Sentry within a minute; a dashboard shows bid p95 and queue lag.

### [ ] T19 — Load test the closing window

**Depends on:** T17
**Build:** k6 scripts: 5,000 viewers on one lot, 1,000 bids/s platform-wide, 1,000 lots closing in 10 minutes, run against staging.
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
