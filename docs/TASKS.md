# TASKS.md — LotVanta build plan

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

Implemented on 2026-10-24 in [PR #2](https://github.com/bhoyee/auction-ng/pull/2), targeting `dev`. [All tables, columns/types, relations and constraints](specs/database-schema.md); [validation and review notes](t02-validation.md). **MONEY/BID CHANGE — needs human review** before merge.

**Depends on:** T01
**Build:**

- Prisma schema for: users, wallets, ledger_entries, virtual_accounts, payments, locations, categories, lots, lot_images, bids, watchlist, invoices, invoice_lines, fulfilments, notifications, strikes, audit_log, idempotency_keys.
- Money columns as integer kobo (`BigInt` for ledger amounts).
- Indexes: `lots(status, end_at)`, `bids(lot_id, amount_kobo desc)`, unique `ledger_entries(idempotency_key)`, unique `payments(provider, provider_ref)`.
- Seed: 1 location (Lagos hub), 12 categories, 200 lots with placeholder images and staggered end times, 20 buyers, 3 staff users.
  **Done when:** `pnpm db:migrate && pnpm db:seed` works on an empty database; schema reviewed against blueprint data model.

### [x] T03 — Shared business rules (MONEY/BID)

Implemented on 2026-10-24 in [PR #3](https://github.com/bhoyee/auction-ng/pull/3), stacked on the open T02 branch. [Rule contracts and integration boundaries](specs/shared-rules.md); [validation](t03-validation.md). All 69 tests pass with 100% line and branch coverage on the new shared modules; lint, typecheck and all builds pass. **MONEY/BID CHANGE — needs human review** before merge.

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

### [x] T04 — Auth: email OTP and roles (owner-approved interim change)

Reset eligibility follow-up (2026-10-29): reject missing/inactive/non-buyer emails before code dispatch and keep the email form visible with a red banner. Only accepted active-buyer requests reveal code/password inputs. [Focused review](design/reset-email-validation/README.md); broader T13 status unchanged.

Auth error feedback correction (2026-10-29): top-of-form red banners with manual close, timed dismissal and hover/focus pause, covering field validation and server errors. Targeted responsive checks and [captures](design/auth-error-banners/README.md) pass; broader T13 acceptance is unchanged.

Auth protection/polish (2026-10-29): explicit invalid login feedback without code delivery, purpose-specific IP/device limits, signup honeypot, password visibility, segmented codes and photo-free auth screens. Focused validation and screenshots: [auth polish](design/auth-polish/README.md). T13 overall acceptance remains open.

Owner-approved password follow-up (2026-10-29): buyer password plus email code, signup verification, first-password/recovery flow, all-session revocation with funded-preparation fencing, and expanded encrypted Profile. See [contracts and rollout](specs/buyer-password-auth.md) and [responsive review](design/buyer-password-auth/README.md). Staff authentication stays separate.

Implemented on 2026-10-24 in [PR #4](https://github.com/bhoyee/auction-ng/pull/4), stacked on T03. [Authentication contracts](specs/authentication.md); [validation and limits](t04-validation.md); [branded email previews](design/t04-email/README.md). The owner-requested professional email follow-up brings the suite to 97 tests and nine browser checks; lint, typecheck and builds pass. Human security review remains pending; production email/staff authentication and UI screens are deferred as documented. T05 is tracked separately below.

SMTP follow-up (2026-10-27), [draft PR #19](https://github.com/bhoyee/auction-ng/pull/19): owner approved Resend SMTP for verification and winner emails. [Configuration and acceptance limits](specs/smtp-email.md). SMTP implementation passes local lint, types, full tests and production builds, with 21 focused transport/config/receipt checks. Real delivery still requires a private credential and verified sender domain; no external test email has been sent.

**Depends on:** T02
**Build:** owner-approved email-first login behind an `EmailProvider` interface with a local Docker test inbox; request-code and verify-code endpoints; Nigerian phone normalisation retained for later verification; access + rotating refresh tokens; roles guard; rate limits on OTP; profile endpoints. SMTP delivery is added in the owner-approved follow-up; SMS/Termii remains deferred. Email verification never marks a phone verified. The later owner amendment makes verified email sufficient for the verification requirement before bidding.
**Done when:** a buyer can sign up and log in with an emailed OTP in the local test inbox; codes are never printed to logs; brute force is rate-limited; tests cover expiry, reuse, wrong-code attempts and refresh rotation. Staff email-only login is blocked pending SSO/MFA.

### [x] T05 — Ledger and wallet service (MONEY/BID)

Implemented on 2026-10-24 in [PR #5](https://github.com/bhoyee/auction-ng/pull/5), stacked on T04. [Wallet contracts](specs/wallet-ledger.md); [validation and local instructions](t05-validation.md); [complete database dictionary](specs/database-schema.md). All 118 tests and nine browser checks pass, including 50 concurrent holds and 50 duplicate retries; lint, typecheck and builds pass. **MONEY/BID CHANGE — needs human review** before merge. Paystack integration remains T06.

**Depends on:** T02, T03
**Build:** `apps/api/src/ledger` with operations `topup`, `hold`, `releaseHold`, `captureHold`, `debit`, `refund`, `payout` — each idempotent, transactional, with row locks; available vs held balance; wallet history endpoint.
**Done when:** tests prove no double-spend under 50 concurrent hold requests on one wallet; replaying any operation with the same idempotency key changes nothing; balances always equal the sum of entries.

### [~] T06 — Paystack virtual accounts and top-up (MONEY/BID)

2026-10-30 closed-lot correction: [x] authoritative public result read and automatic detail transition from live bidding to closed/sold/unsold, with final paid price and no stale bid controls. [Contract](specs/public-lot-result.md) and [targeted review](design/closed-lot/README.md). No closing/ledger mutations; broader milestone acceptance is unchanged.

2026-10-30 purchase/bell follow-up: [x] Buy Now and payment-return result popups, red unread badge, paid Awaiting pickup count and persisted owner-only read acknowledgements. [Contracts](specs/buyer-notifications.md) and [targeted captures](design/purchase-notifications/README.md). T06/T13 overall remain open; settlement and money rules are unchanged.

2026-10-30 buyer feedback/session recovery: [x] bid/watch success and failure banners, prominent live winning status, wider balance amounts, coordinated expired-session renewal and one retry for wallet reads. [Targeted checks and captures](design/buyer-feedback/README.md). No fee, ledger, bid-engine or server authentication-policy changes; broader T06/T13 acceptance remains open.

2026-10-30 wallet workspace polish: [x] responsive tabbed history tables, first-open payment choices, pending-check dialog, indigo fee action, independent silent reads, red refresh notices and one-line balances. [Targeted checks and screenshots](design/wallet-workspace/README.md). T06/T13 overall remain open; no settlement or bidding changes.

2026-10-30 wallet simplification: personal-account panel/setup hidden, account-status reads removed, one-time transfer and card options retained. Existing account records, receipts and financial APIs remain intact. Targeted UI validation and captures: [wallet review](design/payment-return/README.md). Broader T06/T13 remain open.

2026-10-30 wallet follow-up: one-time transfer funding with separate accepted fees/intents, safe webhook/confirmation credit and reconciliation; silent wallet/side balance refresh, stronger status feedback and alphanumeric bank-list compatibility. [Contracts and targeted validation](specs/wallet-transfer-checkout.md). T06 remains open for actual provider acceptance and human review. MONEY/BID CHANGE - needs human review.

2026-10-30 checkout correction: digits-only wallet amount, server-owned browser callback and authenticated verified return status for wallet and fixed-price payments. [Contracts and remaining acceptance](specs/payment-return.md). T06 stays in progress pending actual provider acceptance. MONEY/BID CHANGE ? needs human review.

2026-10-30 local setup: test credentials verified, webhook-only ngrok tunnel configured and signed/forged connection checks passed. [Current URL, commands and remaining real-payment acceptance](specs/local-paystack-webhook.md). T06 remains in progress. The missing-key statement in the historical implementation note below is superseded by this update.

Backend implementation is in [draft PR #6](https://github.com/bhoyee/auction-ng/pull/6), stacked on T05, with owner-approved buyer-paid fees, hosted card funding and bank transfers, quote/receipt APIs, consent and test virtual accounts, verified idempotent net credits, review-only refund requests and nightly reconciliation. [Contracts](specs/paystack-topup.md); [setup and remaining sandbox acceptance](t06-validation.md). All 176 tests, nine browser checks, lint, typecheck and builds pass; all nine Docker services are healthy. The actual Paystack test key and reachable sandbox webhook are not configured; do not mark done until that provider transfer check passes. **MONEY/BID CHANGE — needs human review**.

**Depends on:** T05
**Build:** `PaymentProvider` interface + Paystack implementation (test mode); consent + BVN capture flow; create Dedicated Virtual Account; webhook endpoint with signature check and transaction re-verification; credit via ledger `topup`; nightly reconciliation job comparing Paystack transactions with ledger entries.
**Done when:** a test-mode transfer credits the wallet exactly once even if the webhook is delivered three times; a forged webhook is rejected; reconciliation reports mismatches.

---

## Milestone 2 — Catalogue

### [~] T07 — Lots, categories and images

Backend implementation is in [draft PR #7](https://github.com/bhoyee/auction-ng/pull/7) on `task/t07-catalogue`, stacked on T06. Public filtered/keyset-paginated catalogue APIs, draft-only staff intake, checksum-bound private R2 uploads and bounded public WebP derivatives are implemented. All 190 tests, nine browser checks, lint, typecheck and builds pass; 50-lot HTTP p95 is 64.4 ms with four SQL queries. [Contracts](specs/catalogue.md); [validation and PowerShell setup](t07-validation.md); [complete database dictionary](specs/database-schema.md). Real R2 upload/CDN acceptance and operational staff SSO/MFA remain pending; do not mark done or enable a buyer-auth fallback. T08 is tracked below.

**Depends on:** T02
**Build:** public endpoints for lot list (filters: category, location, ending soon, price range; cursor pagination), lot detail, categories; admin endpoints to create/edit lots; image upload to R2 with presigned URLs; generated thumbnail sizes.
**Done when:** list endpoint returns 50 lots in < 100 ms locally with a fixed number of queries; images are served as WebP thumbnails ≤ 30 KB.

### [x] T08 — Search

Implemented on 2026-10-25 in [draft PR #8](https://github.com/bhoyee/auction-ng/pull/8), stacked on T07: typo-tolerant Meilisearch queries, matching catalogue filters, closing-time keyset pagination, a durable transactional outbox and BullMQ synchronization. All 198 tests, nine browser checks, lint, typecheck and builds pass locally. Real Meilisearch/BullMQ acceptance proves `iphnoe` finds iPhone and a closed lot leaves the engine in 1,968 ms, below ten seconds. [Contracts](specs/search.md); [PowerShell setup and validation](t08-validation.md); [all 26 tables and constraints](specs/database-schema.md). Earlier Paystack/R2 acceptance remains pending independently. T09 is tracked below.

**Depends on:** T07
**Build:** Meilisearch index for open lots, synced on create/update/close through the worker; search endpoint with typo tolerance and the same filters as the list.
**Done when:** searching "iphnoe" finds iPhone lots; a closed lot disappears from search within 10 seconds.

---

## Milestone 3 — Live bidding

### [x] T09 — Bid engine in Redis (MONEY/BID)

Implemented on 2026-10-25 in [draft PR #9](https://github.com/bhoyee/auction-ng/pull/9), stacked on T08: owner-approved funded preparations, transactional ledger reservations, cached atomic Redis Lua proxy/soft-close acceptance, exact retries and BullMQ expiry/outbid release. All 215 tests, nine browser checks, lint, typecheck, production builds and Linux CI pass; all nine local Docker services are healthy. Lua matches 10,000 shared-rule cases; 500 simultaneous contenders retain one leader; durable acceptance p95 is 33.08 ms on Windows/Docker Desktop. [Contracts and recovery boundary](specs/bidding.md); [validation and PowerShell instructions](t09-validation.md); [all 28 tables/constraints](specs/database-schema.md). Bidding remains disabled pending review and the later persistence/settlement tasks. **MONEY/BID CHANGE — needs human review** before merge. T10 and T12 are not included.

**Owner-approved amendment, 2026-10-25:** direct bidding is now the default, with automatic bidding available only through an explicit choice. Mode is immutable in the funded preparation; existing automatic commitments retain their meaning. All 230 tests, lint, typecheck and production builds pass. Mixed-mode Lua acceptance p95 is 16.58 ms; 10,000 rule comparisons and 500 concurrent contenders pass. [Changes, PowerShell validation and release limits](bid-modes-validation.md). Buyer screens and T10 persistence remain separate.

**Depends on:** T03, T05
**Build:** Lua script implementing the full accept-bid path in AGENTS.md §6; loading open lots into Redis when an auction opens; `POST /lots/:id/bids` with idempotency key; wallet hold/release integration; Redis Stream for accepted bids.
**Done when:** Lua logic matches `resolveBid()` on 10,000 random property-based cases; 500 concurrent bidders on one lot never produce two leaders or a price below the rules; p95 accept time < 50 ms locally.

### [x] T10 — Bid persistence worker (MONEY/BID)

Implemented on 2026-10-25: bounded Redis Stream consumer-group processing, immutable PostgreSQL receipts/request/counter rows, verified idempotent replay and acknowledgement only after commit. All 235 tests, lint, typecheck and production builds pass locally. Tests kill an actual worker before commit and after commit/before acknowledgement; restart recovers every event with no duplicate rows or wallet movements. Existing 10,000 rule comparisons and 500 concurrent bid checks remain green; acceptance p95 is 11.72 ms. [Persistence contract](specs/bid-persistence.md); [validation and PowerShell steps](t10-validation.md); [all 29 tables and constraints](specs/database-schema.md). **MONEY/BID CHANGE — needs human review.** Bidding remains disabled; T11 realtime and T12 closing/invoicing are not included.

**Depends on:** T09
**Build:** worker that reads the bid stream and writes `bids` rows idempotently; recovers after restart from the last acknowledged entry.
**Done when:** killing the worker mid-stream and restarting loses and duplicates nothing (tested).

### [x] T11 — Real-time gateway

Implemented on 2026-10-25: authenticated Socket.IO lot/user rooms, Redis-backed private-safe updates/outbid routing, fresh snapshots on reconnect, expiry/revocation checks, server-time offset and a shared app-bound React hook. All 245 tests, lint, typecheck and production builds pass locally. A real Redis price change reaches 1,000 actual socket viewers at p95 267.52 ms under local build load, below 500 ms; bid acceptance remains below 50 ms at p95 28.67 ms. Tests cover transport recovery, actual API sessions/funded bids/logout, origin rejection, concurrent 50-room limits, older-version rejection and both app React versions. [Protocol](specs/realtime.md); [validation and PowerShell steps](t11-validation.md). **MONEY/BID CHANGE — needs human review** for the routing metadata added to Lua publication. Bidding remains disabled; T12 settlement and buyer screens are not included.

**Depends on:** T09
**Build:** Socket.IO gateway with Redis adapter; rooms per lot and per user; events `lot:update` (price, leader flag, endAt), `user:outbid`, `serverTime` on connect; auth on connect; shared client hook in `packages/api-client` with auto-reconnect and resubscribe.
**Done when:** a price change reaches 1,000 simulated viewers with p95 < 500 ms locally; a dropped connection resubscribes and shows the current price.

### [x] T12 — Lot closing and invoicing (MONEY/BID)

Owner-requested follow-up (2026-10-28): [automatic no-bid relisting](specs/unsold-relisting.md), at most two 24-hour retries, retained conditions/photos/history, administrator opt-out and Unsold awaiting review filter. Unpaid wins remain separate. **MONEY/BID CHANGE — needs human review.**

Implemented on 2026-10-25 in [draft PR #13](https://github.com/bhoyee/auction-ng/pull/13), stacked on T11. [Settlement contracts](specs/lot-closing.md); [validation and local commands](t12-validation.md); [winner-email layouts](design/t12-email/README.md). All 260 tests, 12 browser checks and nine production builds pass. The mixed 1,000-lot closing test completes in about 80 seconds. **MONEY/BID CHANGE — needs human review** before merge.

**Depends on:** T10, T05
**Owner-requested follow-up:** [Readable lot/invoice references](specs/public-references.md) use secure random eight-character alphanumeric bodies for new records instead of UUIDs or sequential counters; internal UUIDs and existing issued references remain unchanged.
**Build:** scheduler that closes lots at `endAt` (respecting soft-close extensions); freezes winner in PostgreSQL; captures hold; creates invoice and invoice lines using `fees.ts`; creates pickup fulfilment with QR token; notifies winner; releases losers' holds; handles insufficient funds (24 h to pay, then strike and relist).
**Done when:** running the closer twice on the same lot charges once; 1,000 lots closing within 10 minutes all close correctly; tests cover no-bid lots, extended lots and failed captures.

---

## Milestone 4 — Buyer apps

### [x] D01 — Design system in code (before any screen)

Implemented in [PR #16](https://github.com/bhoyee/auction-ng/pull/16). Owner approved progression to T13 on 2026-10-25 after visual review was requested. [Component contracts and PowerShell preview commands](specs/design-system.md); [responsive web and native screenshots](design/d01/README.md). Includes web/native controls, auction cards, feedback states and development-only galleries; no product screens or live payment/bid actions. All local checks and both GitHub CI runs passed.

**Depends on:** T01 (can run in parallel with Milestones 1–3)
**Build:**

- `packages/ui/tokens.ts`: colours, type scale, spacing, radii, shadows from `docs/DESIGN.md`, exported for Tailwind (web/admin) and as a theme object (mobile).
- Load Schibsted Grotesk on web (next/font) and mobile (expo-font).
- Web components: Button (primary, secondary, ghost, danger; sizes), Input, OTP input, Naira amount input, Select, Chip/Badge (condition grades, statuses), Live pill, Countdown, Price (with flash on change), Lot card, Lot card skeleton, Bottom sheet/Dialog, Tabs, Toast, Empty state, Error state, Offline banner, Header, Footer.
- Mobile equivalents of the same components in `apps/mobile/components/ui`, using the shared tokens.
- A `/design` page in `apps/web` (dev only) and a hidden screen in the app showing every component and state with real-looking Nigerian data.
  **Done when:** every component on the `/design` page matches DESIGN.md, passes the §8 anti-"AI-generated" checklist, meets contrast and 44 px touch-target rules, and screenshots at 360/768/1280 px are attached to the PR. The business owner approves the look before T13 starts.

### [~] T13 — Web buyer app (redesign under review; loading budget open)

Buyer header/watchlist follow-up (2026-10-29): remove the header wallet chip and redundant Profile recovery link; add live saved-item counts to the header and menus, with owner-scoped count reads, local-change refresh and same-user tab synchronization. [Targeted validation and captures](design/watchlist-counts/README.md). Overall T13 acceptance remains open.

Buyer portal follow-up (2026-10-29): signed-in sidebar/mobile menu, simplified wallet presentation, private Buy Now history and outstanding pickup lists. Check-in uses existing private passes; Shipments explains delivery is not available. Targeted API/browser validation and screenshots are recorded in [buyer portal review](design/buyer-portal/README.md). Overall T13 acceptance remains open.

Deals artwork/options follow-up (2026-10-29): owner images with matching uppercase titles, green selections, revised Naira price choices, WAT today/tomorrow and all conditions checked by default. Twelve filter-boundary/default tests, eleven affected catalogue tests and responsive browser checks pass. [Current captures](design/deals-heading-assets/README.md). Overall T13 acceptance remains open.

Deals-page follow-up (2026-10-29): large contextual headings/icons, pill checkbox dropdowns with automatic multi-select live-price/end/condition filtering, no count/location/Apply controls, shareable selections and cursor pagination. Nine filter unit tests, eleven affected catalogue integration tests, focused lint/types/builds and responsive browser checks pass. [Previews and verification](design/deals-filters/README.md). Overall T13 loading-budget and owner acceptance remain open.

Auction-policy follow-up (2026-10-29): policies after Pickup and delivery, current Naira fees/payment wording, owner-approved inspect/test-before-removal and no returns after collection, with Help/Terms aligned. [Responsive previews and targeted verification](design/auction-policies/README.md). Payment/refund processing and overall T13/T21 acceptance remain unchanged.

Detail-information follow-up (2026-10-29): sticky desktop gallery, right-column Description → Bid History → Condition → Pickup and delivery, full-width Similar items, ten-row history pages and labelled read-only demo pagination preview. [Responsive evidence](design/lot-detail-information/README.md). Overall T13 acceptance remains open.

Gallery correction (2026-10-29): edge-to-edge item image, direct image activation and larger full-photo popup with top-right close, keyboard/Escape support and focus restoration. [Targeted verification and screenshots](design/gallery-image-viewer/README.md). Overall T13 acceptance remains open.

Public history/detail follow-up (2026-10-28): public anonymised leading-price history, authenticated item-specific Your Bid, responsive WAT table, item reference and top-right watch/share actions, red discount and stronger button feedback. New additive history index is documented in the database dictionary. Focused verification and [responsive previews](design/lot-history/README.md); overall T13 acceptance remains open.

Lot-detail refinement (2026-10-28): enlarged live price/countdown, condition and estimate-discount badges, guest join action, compact fixed-price offer and configured pickup address. Targeted UI/catalogue checks, affected builds and responsive checkout checks passed. [Previews and scope](design/premium-lot-detail/README.md). Overall T13 acceptance remains open.

Fixed-price purchase follow-up (2026-10-28): optional audited admin pricing, trophy/Naira card badge, tax-only item checkout, wallet/card/transfer options, deadline-capped reservations, verified late wallet credit, single paid invoice/pickup pass and recoverable bid-hold release. [Contracts and validation](specs/fixed-price-purchases.md); [buyer screenshots](design/fixed-price-purchases/README.md); [admin screenshots](design/fixed-price-admin/README.md). Wider T13/T15 and native T14 acceptance remain open. **MONEY/BID CHANGE — needs human review.**

Closing now action follow-up (2026-10-28): See all shares Top Deals' outlined button and hover/focus treatment. [Focused preview](design/closing-see-all/README.md). Real fixed-price purchases requested separately; business-rule clarification pending. Overall T13 acceptance remains open.

Item-card timer follow-up (2026-10-28): segmented countdown overlays the bottom of each image; blue normally/red within 20 minutes, no bid-count badge on cards, count in detail-page Bid history tab. [Responsive preview and targeted checks](design/card-image-timer/README.md). Overall T13 acceptance remains open.

Demo preview follow-up (2026-10-28): local homepage populated with eight featured demo lots and four genuinely closing lots through `pnpm demo:home`. [Preview evidence](design/demo-home-preview/README.md). Existing auctions/bids preserved; no further staff-portal development or overall T13 acceptance change.

Footer credit follow-up (2026-10-27): added owner-requested Powered by GiddyHost link beside the copyright. Focused footer link/responsive checks; overall T13 acceptance remains open.

Past Auctions follow-up (2026-10-27): purchased-only public archive, cursor pagination and final winning prices from paid invoices; bold contact email moved to Help and archive link added under Explore. [Rules, responsive captures and focused verification](design/past-auctions/README.md). Overall T13 acceptance remains open.

Footer arrangement follow-up (2026-10-27): all requested social icons, configurable HTTPS profile URLs, payment marks below Legal, tighter desktop links, no underlines or Paystack/demo footer labels. [Updated responsive evidence](design/footer-policies/README.md). Profile destinations other than WhatsApp await configuration; T13 acceptance remains open.

Compact footer correction (2026-10-27): tightened spacing, requested Help/Legal links, condition guidance anchor, configured WhatsApp icon and payment brand marks. Cookie settings moved from footer to policy pages. Focused web checks and updated [responsive captures](design/footer-policies/README.md); T13 acceptance remains open.

Footer and policies follow-up (2026-10-27): dark indigo footer, configurable public support email, three clearly marked policy drafts and necessary-storage notice with reopenable settings. [Responsive captures and focused verification](design/footer-policies/README.md). Registered operator details and legal review remain open; T21 and overall T13 acceptance are not completed by this UI change.

FAQ surface follow-up (2026-10-27): lighter white/indigo treatment with a larger 40 px desktop / 30 px phone heading. [Responsive previews](design/home-faq-light/README.md). Focused interaction check and web build passed; T13 acceptance remains open.

Home FAQ follow-up (2026-10-27): added a dark accessible FAQ after the app-download banner and kept the desktop app headline on one line. [Responsive previews and focused checks](design/home-faq/README.md). T13 acceptance remains open.

Open-tab update follow-up (2026-10-27): fresh localhost browser confirms live updates, but the owner's older-tab Ended report was not reproduced directly. Added home-only build-version detection to update future deployments automatically after one initial code reload. [Checks and limitations](design/home-version/README.md). T13 acceptance remains open.

Live catalogue follow-up (2026-10-27): automatic 20-minute section movement, blue/red timers, no imminent lots in Top Deals, silent catalogue refresh and expired-card removal without a page reload. Targeted tests and browser lifecycle checks pass. [Behaviour, previews and verification](design/home-live/README.md). T13 acceptance remains open.

Banner and closing emphasis (2026-10-27): approved Stay close to your next win copy, four-card desktop Closing now layout, bold closing heading and larger red countdown badges on both home rails. [Focused previews](design/closing-emphasis/README.md). T13 acceptance remains open.

Simplified app banner (2026-10-27): owner removes the phone and extra labels/link. Spread copy and clickable store badges across the banner; use general store pages pending LotVanta listing URLs. [Revised previews](design/app-banner-simple/README.md). T14 unchanged; T13 remains open.

App banner correction (2026-10-27): owner rejected the preceding composition. Tightened copy/phone grouping and replaced the miniature website screenshot with a labelled app design preview. [Revised previews](design/app-banner-tight/README.md). T14 remains unchanged and T13 acceptance stays open.

App banner follow-up (2026-10-27): redesigned the contained app promotion with official store badge artwork, Coming soon status and a current mobile web screenshot in an upright phone. [Focused previews](design/app-banner/README.md). T14 is unchanged; T13 acceptance remains open.

Card metadata follow-up (2026-10-27): yellow UNTESTED, distinct same-row timer/bid badges, bold Top Deals without subtitle and stronger See all hover/focus. [Focused previews](design/card-meta/README.md). T13 acceptance remains open.

Card readability follow-up (2026-10-27): larger Sell All Auctions action, bold two-line titles, larger prices/countdowns and top-left uppercase condition badges; percentage badges and visible Starting bid labels removed. [Focused previews](design/card-readability/README.md). T13 acceptance remains open.

Top deals refinement (2026-10-27): exact See All Auction label, four desktop cards, desktop hover/focus Bid now reveal and replacement guide artwork with fresh optimized URLs. [Focused previews](design/deal-hover/README.md). T13 acceptance remains open.

Home deal actions follow-up (2026-10-27): removed pickup labels from item cards, exposed home Top deals Bid now buttons, polished See all hover and added See all auctions linking to a populated Search auctions browser. [Focused review and previews](design/deal-actions/README.md). T13 acceptance remains open.

Navigation stability follow-up (2026-10-27): fixed a closed live-client lifecycle race when changing catalogue pages. Targeted web lint/typecheck/build and local category/Home/All deals/Help navigation checks passed. A focused regression test was added for later suite execution; broader suites remain deferred. T13 acceptance remains open.

Item-card follow-up (2026-10-27): condition badge colours and second-by-second countdown display updated. Yellow Instant win styling is prepared but not enabled for real stock pending clarification. [Responsive previews and verification](design/item-cards/README.md). Overall T13 acceptance remains open.

Image-only guide follow-up (2026-10-27): owner replaced visible guide copy/trust lines with updated guide-1/2/3 artwork. Responsive AVIF/WebP generation, lazy loading, accessible full-text alternatives and content-hashed caching keep image delivery small. See [current previews and size notes](design/home-onboarding/README.md). Local automated tests remain deferred and overall T13 acceptance is still open.

Homepage onboarding cards (2026-10-27): added the owner-requested Sign up & top up / Bid & win / Pick up & repeat cards below the hero, replacing the lower signed-out guide. [Responsive design previews](design/home-onboarding/README.md). Web build passed; local automated tests remain deferred. T13 acceptance remains open.

Home-layout correction (2026-10-27): implemented the approved unified 1400 px container, composed hero, compact categories, non-repeating product rails, sixty credited photo sources and public read-only prices. Targeted lint/type checks, 39 relevant tests, affected production builds and homepage browser checks in both account states at five widths passed. [Responsive review and captures](design/home-layout/README.md). This supersedes the earlier split-width composition; overall T13 loading-budget and owner acceptance gates remain open.

Header refinement (2026-10-27): implemented in [draft PR #21](https://github.com/bhoyee/auction-ng/pull/21): two-tier shopping navigation, Help dropdown, configurable WhatsApp contact and distinct account actions. The header removes announcement copy and the category-name strip; synthetic lots remain labelled. [Behaviour and contact configuration](specs/marketplace-header.md); [responsive captures and passing local validation](design/header/README.md). T13 acceptance remains open pending the wider loading budget and review.

Owner header review follow-up: move WhatsApp inside Help, remove the below-header demo notice and align deal links right while All categories stays left. Existing lot/photo/footer demo disclosures remain.

Wide-screen/hover follow-up: preserve laptop width, expand large-screen buyer containers to 1,800 px and add visible hover feedback to the seven requested header controls. Owner requested targeted local checks; shared UI typecheck, changed-file lint/format, production web build and focused browser verification at eight widths passed. [Review evidence](design/header/wide/README.md). Full CI is unchanged.

Composition follow-up: keep the wide catalogue but cap search/promotions, increase large-screen product columns and preserve narrow reading/forms. Local verification targets only these layout changes. [Responsive comparison](design/header/composition/README.md).

Demo duration follow-up (2026-10-27): seed 120 lots across six closing windows from 6 hours to 5 days, with funded synthetic bids. Refreshes retain previous databases; see the [demo guide](specs/marketplace-demo.md). T13 acceptance status is unchanged.

Owner rejected the original visual result on 2026-10-26. Reopened on `task/t13b-redesign` for a photographic marketplace redesign, populated demo catalogue, contextual navigation and proper email-OTP signup. The earlier [implementation](specs/web-buyer.md) and [captures](design/t13/README.md) are historical functional evidence, not visual acceptance. Email OTP is retained; the owner approved amending AGENTS.md and using credited licensed stock photos for demo content. T14 has not started. Human money/bid review and provider acceptance gaps in T06/T07 remain open.

T13b is submitted in [draft PR #18](https://github.com/bhoyee/auction-ng/pull/18). Implementation and local verification evidence: [75 responsive review captures and performance evidence](design/t13b/README.md), [PowerShell demo guide](specs/marketplace-demo.md), and [email eligibility/fencing](specs/email-bid-eligibility.md). Lint, typecheck, tests, production build and the full functional browser journey pass locally. The production financial audit passed; the populated photographic audit passed once at 2.04 s LCP, but repeated unchanged-source runs measured 2.85 s and 3.27 s. Consistent compliance with the 2.5 s loading budget remains open; thresholds and CI requirements are unchanged. Email verification now replaces the phone-verification bid gate by owner approval; funded wallet holds and account restrictions remain enforced. Status remains incomplete pending the loading budget, green final CI, owner visual acceptance and human money/bid review. See [validation and remaining work](t13b-validation.md).

**Depends on:** T07, T11, T06, D01
**Design:** follow `docs/DESIGN.md` (home page structure §9, lot card and lot page §4, bidding UX §6) and any mockups in `docs/design/`. Build only from `packages/ui`.
**Build:** home (Ending soon, categories, deals), category and search pages, lot page with gallery, live price, countdown from server time, max-bid form with estimated total, watchlist, wallet page (account number, balance, history), invoices, pickup passes, auth screens. Edge-cached catalogue pages; live data over socket only.
**Done when:** Playwright covers sign-up → top-up (test mode) → bid → outbid → win → see pickup pass; Lighthouse mobile LCP < 2.5 s on the home page; works at 360 px; every screen has loading, empty, error and offline states; screenshots of each screen at 360/768/1280 px pass the DESIGN.md §8 checklist.

Watchlist polish (2026-10-29): tab hover/focus, prominent indigo/red countdown, red Unwatch and Previous/Next with page status in all three saved-only tabs. Targeted verification: [watchlist review](design/watchlist-tabs/README.md). Overall T13 remains open.

Watchlist follow-up (2026-10-29): saved-only Watching/Won/Lost tabs, live price/countdown cards, pickup address, Unwatch and custom-amount fee-review entry. Ten-row owner/view-scoped pagination and confirmed outcome reconciliation. See [watchlist review](design/watchlist-tabs/README.md). Overall T13 remains open.

### [~] T14 — Mobile app

In progress (2026-11-02): native buyer routes and shared API integration are implemented for review. See [implementation and remaining acceptance](specs/mobile.md). Targeted mobile lint/types, 21 build/session/payment-review tests and Android/iOS bundle exports pass. Separate development and HTTPS release build profiles are configured. End-to-end Android, real-phone EAS installation, push credentials and cold-start acceptance remain open; T14 is not complete.

Home/launch visual rebuild (2026-11-02): approved native splash package, token-generated wordmark, compact search header, photo promotion, responsive product collections and preserved card watchlist actions. Seven focused price-display tests pass. Native Android captures at 360/768/1280 use isolated read-only sample data while Docker is unavailable: [review gallery](design/mobile-home/README.md). The installed release splash still needs a real APK review; Expo Go owns its initial launcher.

**Depends on:** T13 (same API features), D01
**Design:** native feel (tab bar, sticky bid bar, bottom sheets, haptics on bid placed/outbid) while keeping the same brand as web. Follow `docs/DESIGN.md`.
**Build:** same flows as T13 in Expo; FlashList for lists; image caching; push notifications for outbid and win; secure token storage; data-saver toggle; deep links to lots.
**Done when:** Maestro flow covers sign-up → bid → win on Android; cold start < 3 s on a mid-range Android; EAS preview build installs on a real phone.

---

## Milestone 5 — Operations

### [~] T15 — Admin dashboard (Top Deals and staff sign-in; operations remain pending)

Owner-requested subset (2026-10-28): administrator-controlled Top Deals, display order and audited saves, plus approved staff email/password + Google Authenticator sign-in. [Setup and API contracts](specs/admin-top-deals.md); [responsive review](design/admin-top-deals/README.md). Intake, scheduling, pickup, refunds, account management and the overall T15 acceptance criteria remain incomplete.

- [x] Top Deals curation subset: implementation, additive migrations, focused permission/concurrency/auth tests, production builds and responsive browser review completed locally. Private staff account setup remains an operator step; production security review and the wider T15 acceptance criteria remain open.

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

Watchlist loss follow-up (2026-10-30): [x] confirmed-sale loss alerts by email and in-app bell; active-only count decreases automatically while saved Lost history remains. Bounded, concurrent-safe result processing and additive migration. See [contract](specs/watchlist-loss-alerts.md) and [targeted captures](design/watchlist-loss/README.md). Overall T13 remains open.

Outbid/Wallet follow-up (2026-10-30): [x] durable in-app and SMTP outbid alerts with item links, retry/concurrency protection and private-limit preservation; Wallet page/menu naming and yellow reserved-funds panel. Targeted bid persistence/Lua, notification and responsive UI checks only. See [contract and review](specs/outbid-alerts.md). Overall T13 remains open.

Wallet withdrawal follow-up (2026-10-30): [ ] Core policy approved and implementation specification recorded in [wallet withdrawals](specs/wallet-withdrawals.md). Identity-verification method and mixed-source allocation await clarification. No public withdrawal endpoint is enabled; T23 is not complete.

Wallet withdrawal implementation (2026-10-30): [x] bank-source ledger allocation, BVN/bank verification flow, password/email-code confirmation, configurable limits, durable transfer processing, finance-review API, owned history, receipts and outcome notifications; [x] local test-mode Wallet UI. [ ] Real Paystack beneficiary/KYC acceptance, levy-bearing reversal reconciliation and human money review. Staff-portal review screen remains separate. Overall T23 is open; see [implementation/acceptance](specs/wallet-withdrawals.md).

Wallet bank-picker correction (2026-10-30): [x] automatically load all bank pages, searchable bank selection, periodic/focus refresh and solid red withdrawal errors. Targeted UI checks only; see [review](design/wallet-bank-picker/README.md). Overall T23 remains open.

Bank-directory regression (2026-10-30): [x] fix rejected two-digit Paystack bank codes; verify all nine actual directory pages and search selection at 360/768/1280 px. Nineteen targeted tests pass. See [review](design/wallet-bank-directory/README.md). T23 remains open.

Withdrawal receipt styling (2026-10-30): [x] solid indigo review/pending banner, green success/red failure banners, solid indigo Back to wallet action with hover. Targeted receipt-dialog checks only; no payment behavior changes. See docs/design/withdrawal-review-banner.

Wallet controls/tables follow-up (2026-10-30): [x] balance-card withdrawal action, compact explanatory copy/bold limits, coloured status/method badges and explicit cursor-backed Previous/Next pagination on all three wallet tables. Targeted UI checks only; see [review](design/wallet-tables/README.md). T23 remains open.

Withdrawal fee-preview follow-up (2026-10-30): [x] server-side principal-plus-fee availability check, red insufficient-funds stop, solid fee button/hover and bold masked beneficiary details. Thirteen targeted withdrawal tests and three-width UI checks pass. [x] Bank-account replacement approved and completed in the follow-up below. See [review](design/withdrawal-quote-balance/README.md). T23 remains open.

Withdrawal bank-change follow-up (2026-10-30): [x] Change account action, password/email confirmation, stored-BVN verification, immutable bank history and concurrency fences for outstanding withdrawals. Additive migration, typed API/Swagger and responsive states complete. Eighteen targeted withdrawal tests plus eight email tests pass. See [review](design/withdrawal-bank-change/README.md). Overall T23 remains open for real-provider acceptance and production review.

Withdrawal cancellation and wallet polish (2026-10-30): [x] owned draft/review cancellation, idempotent reservation release, approval/concurrency fences, typed API and notification; compact method badges, full-row funding selection and corner limits. Twenty-two withdrawal integration tests plus thirteen focused policy/email tests pass; browser checks at 360/768/1280 px pass. See [review](design/wallet-cancellation/README.md). T23 remains open for production review and real-provider acceptance.

Wallet funding field and badge correction (2026-10-30): [x] red Cancelled status, slate Card/yellow One-time transfer method badges and Amount to Fund with persistent Naira prefix. Changed-file lint, web/UI types, buyer build and targeted 360/768/1280 px browser checks pass. See [review](design/wallet-funding-field/README.md). Payment rules unchanged; T23 remains open.

Withdrawal popup and refresh follow-up (2026-10-30): [x] fixed Naira prefix on bank-receives field and compact status badges with accessible click targets. Confirmed existing silent 15-second funding/activity/withdrawal table refresh with changing browser fixtures and no reload, at 360/768/1280 px. Changed-file lint, web/UI types and buyer build pass. See [review](design/wallet-withdrawal-refresh/README.md). T23 production gates remain open.

Withdrawal provider rejection (2026-10-31): [x] diagnose actual Paystack test rejection (Starter Business / transfer_unavailable), preserve safe typed error, record nullable processing issue and show red Payment service unavailable with reserved-funds explanation. Same-reference retry and exact-once verified settlement remain protected. Fifteen provider tests, twenty-three withdrawal integration/concurrency tests, relevant lint/types/builds and 360/768/1280 px browser checks pass. See [review](design/withdrawal-provider-issue/README.md). Actual Paystack success remains blocked by account Transfers access; owner retained test mode and requested the message fix only. T23 remains open.

Global wallet controls (2026-10-31, owner approved): [x] admin-only independent deposit/withdrawal switches, required reason/confirmation, revision and exact-retry protection, encrypted audit, API admission enforcement and disabled buyer controls with silent refresh. Existing accepted requests and provider reconciliation continue. New singleton migration and full database dictionary included. Forty-three distinct targeted cases passed across the affected suites/focused follow-ups; lint/types, API/worker/web/admin builds and three-width admin/buyer browser checks pass. See [contract](specs/wallet-controls.md) and [screenshots](design/admin-wallet-controls/README.md). No individual buyer blocks; T23 production/human-review gates remain open.

Pending deposit cancellation (2026-10-31, owner confirmed): [x] owned pending hosted wallet checkouts can be closed locally from Funding history, with confirmation, red Cancelled status, retained history, safe error retry and cleared matching browser tracking. Immutable cancellation metadata preserves original payment settlement; verified late payments credit once. Typed/rate-limited API and Swagger, additive migration and complete dictionary included. Sixteen affected funding integration/concurrency tests, relevant lint/types, API/worker/web builds and 360/768/1280 px wallet/return-page checks pass. See [contract](specs/deposit-cancellation.md) and [screenshots](design/deposit-cancellation/README.md). No provider reversal, auto-expiry or automatic cancellation of existing requests. Money-code human review remains required before production.

Funding-history recovery UI (2026-10-31, owner approved): [x] replace standalone pending-check dialog with Check status on each pending hosted card/transfer deposit row. Clear amount-specific pending/success/error feedback, safe same-row retry and silent balance/history updates. Targeted browser checks at 360/768/1280 px, changed-file lint, web types and buyer production build pass. See [review and screenshots](design/funding-history-status/README.md). No backend settlement, fee or ledger rule changes; T23 production gates remain open.

Wallet activity typography (2026-10-31): [x] reduce only Description badges from 14px to the shared 12px fine-text token. Formatting, UI types, buyer build and focused 360/768/1280 px computed-style/browser checks pass. Screenshots: docs/design/wallet-description-type/. No transaction behaviour changed.

Awaiting pickup refinement (2026-10-31, owner requested): [x] full-width aligned order/payment/amount/pass list with responsive phone rows, green Paid tick badges, bold Naira totals and ten-order cursor pagination with Previous/Next/page boundaries. Existing owner-scoped paid/uncollected reads and private pass links retained. Targeted lint/formatting, web/UI types, buyer production build and 360/768/1280px browser checks pass (including alignment, pagination, empty/error recovery and retained silent refresh). See [screenshots and review](design/awaiting-pickup/README.md). No backend payment/collection changes.

Invoice document refinement (2026-10-31, owner requested): [x] professional branded invoice with reference/date, actual status, current Buyer account details, item/line totals, recorded auction or Buy Now charge breakdown and bold total. Back to awaiting pickup plus native Print / Save as PDF; dedicated A4 styling excludes site furniture and action controls. Targeted lint/formatting, web/UI types, buyer build and 360/768/1280px browser checks pass, including A4 PDF generation, error/retry and navigation. See [screenshots/sample PDF](design/invoice-document/README.md). No money/ownership rules changed; historical billing snapshots and legal business data remain outside this UI correction.

Invoice metadata spacing (2026-10-31): [x] align Invoice date, Order type and Currency in compact label/value columns with a 12px gap and left-aligned values. Scoped CSS only; totals retain their existing alignment. Formatting, UI types, buyer build and targeted 360/768/1280px screen/print spacing checks pass; invoice screenshots/sample PDF updated.

Check-in availability correction (2026-10-31, owner approved): [x] hide non-functional Check-in navigation, replace duplicate invoice page with an honest protected availability notice and link to Awaiting pickup, retain sidebar collapse and paid-order/pass flows. No arrival endpoint or staff queue currently exists; these remain future work. Targeted lint/formatting, web/UI types, buyer build and 360/768/1280px browser checks pass. See [review/screenshots](design/check-in-availability/README.md). No false arrival/collection confirmation or money changes.

Working buyer Check-in + staff arrival queue (2026-10-31, owner explicitly authorised): [x] restore Check-in with owned paid/uncollected order selection and explicit physical-arrival confirmation; durable idempotent visits with one active arrival/order, ten-row cursor lists, staff warehouse/admin acknowledge/close with encrypted audit and separate arrival rate limits. Closing a visit does not mark goods collected, release stock or alter wallet/invoice state. Additive migration and full database dictionary, shared strict schemas, typed client and OpenAPI included. Nine targeted database/API/concurrency/role/rate-limit cases pass; affected lint/types, API/web/admin builds and 360/768/1280px buyer/staff browser checks pass. Local demo database migrated and local Docker API/web/admin updated. See [contract](specs/pickup-check-in.md) and [screenshots](design/pickup-check-in/README.md). Physical QR handover/collection confirmation remains a separate pickup-desk workflow; no GPS, pickup-time estimate or location-specific staff assignment added.

### Follow-up completed: visit-based check-in (2026-11-01)

- [x] One private expiring buyer pass per collection centre; staff scan registers a visit spanning paid orders.
- [x] Paginated staff item checklist, explicit idempotent collection receipt, partial pickup and automatic visit completion; legacy records preserved.
- [x] Migration applied locally; database/API/design documentation and responsive screenshots updated. Twenty-two focused integration tests, affected lint/types, API/web/admin builds and 360/768/1280 browser checks passed. Physical scanner/camera acceptance remains an on-site check.

Invoice metadata right alignment (2026-11-01): [x] move the date/order type/currency block to the right edge with right-aligned values, preserving responsive and print layout. Focused invoice browser checks, UI typecheck, lint/formatting and buyer build verified.

Purchase history refinement (2026-11-01): [x] full-width Buy Now order list, dates, coloured status badges, bold totals, invoice actions and ten-row cursor pagination. Silent refresh retains loaded data on failure. Targeted lint/formatting, UI/web types, buyer production build and 360/768/1280 browser checks pass. See docs/design/purchase-history/README.md. Pickup due dates remain T16.

Purchase history heading correction (2026-11-01): [x] remove the repeated Your orders / Buy Now purchases banner and its unused styles; retain the page heading, order columns and pagination. Focused lint/type/build and responsive checks verified.

Buyer Bid history refinement (2026-11-01): [x] full-width shared rows, product thumbnails, dates, bold bid/limit amounts, outcome badges, distinct tab hover/active/focus states and ten-record cursor pagination. Existing page-scoped filters preserved with scope copy; silent refresh and live position updates retained. Affected lint/formatting, UI/web types, buyer build and focused 360/768/1280 browser/socket-fixture checks pass. Screenshots: docs/design/buyer-bids/README.md.

Bid history live-tab cue (2026-11-01): [x] add compact yellow Live dot badges to Winning and Outbid tabs only, plus explicit still-running/rebid copy in Outbid. Settled tabs have no Live badge. Focused lint/types, buyer build and 360/768/1280 browser checks verified.

Live badge motion (2026-11-01): [x] subtle two-second opacity/scale breathing on the Live dot only; steady readable text and no animation under reduced motion. Scoped formatting/lint, buyer build and responsive browser checks cover both motion preferences.

Buyer refresh/access-boundary review (2026-11-01): [x] legacy private reads now reconcile silently; transient errors retain content, definitive denied access discards it; sidebar balance and pending payment status update automatically. Fourteen isolated buyer API tests pass, with focused timed-refresh/access-denial/payment and affected account-list browser checks, lint/types and buyer build. Scope and security limitations: docs/design/account-refresh/README.md. No full penetration-test claim.

Bid history card Live cue (2026-11-01): [x] small yellow breathing Live badge beside active Winning/Outbid item status. Require an online current socket snapshot, non-null price and future server-adjusted end time; remove at expiry/offline/stale connection and omit for settled records. Targeted lint/types, buyer build and 360/768/1280 browser tests cover presence, expiry, offline recovery and reduced motion.

Buyer navigation typography/icons (2026-11-01): [x] bold 700 Bid history tabs and shopping/category navigation; consistent Lucide icons on each buyer dropdown action. Destinations, counts and authentication behaviour unchanged. Targeted lint/formatting, UI/web types, buyer build and 360/768/1280 browser checks pass. Screenshots: docs/design/buyer-navigation/README.md.

Buyer profile refinement (2026-11-01): [x] initials/account header, verified-email badge, responsive Personal details form with read-only email/multiline address and separate password card. Filled actions, visibility controls, clear success/error feedback and retained drafts. Targeted lint/formatting, UI/web types, buyer build and 360/768/1280 browser checks pass, including save/retry, password mismatch/error/retry and sign-in redirect. Screenshots: docs/design/buyer-profile/README.md. Backend account/security rules unchanged.

Account authenticator protection (2026-11-01): [x] optional buyer and mandatory staff/admin authenticator settings, single-use recovery codes, action/session-bound email plus factor verification for login/recovery/password/withdrawal/bank changes, encrypted secrets and additive migration. Targeted lint/formatting/types, 95 isolated authentication/withdrawal tests, API/web/admin builds and 360/768/1280 browser checks pass. Local Docker migrated and services healthy. Screenshots: docs/design/account-two-factor/README.md; contracts: docs/specs/account-two-factor.md. MONEY/BID CHANGE - needs human review. T14 native account screens remain separate; mobile API factor enforcement is tested.

Profile address alignment (2026-11-01): [x] Full address beside Phone number on tablet/desktop, stacked on phones. Targeted lint/types, buyer build and 360/768/1280 layout checks pass. Local Docker updated; screenshots: docs/design/profile-address/README.md.

Buyer dropdown sign-out (2026-11-01): [x] native button reset, pointer/hover/focus feedback, disabled pending state and shared homepage logout redirect; red failure/retry notice. Targeted lint/types, buyer build and 360/768/1280 browser checks pass. Local Docker updated; screenshots: docs/design/buyer-sign-out/README.md.

Customer-service conversations (2026-11-01): [x] guided approved FAQs, persistent buyer inbox/status filters, human handoff, admin/support staff queue, assignment, public replies/private notes, staff-created conversations, resolve/reopen, private compressed attachments and in-app/email updates. Indexed additive migration, typed Swagger/API contracts, scoped rate limits, cursor pagination, session/owner checks and exact retries. Seventeen isolated API/Redis/Socket.IO/BullMQ tests, targeted lint/types, affected production builds and 360/768/1280 browser workflows pass. Local Docker migrated and healthy. Screenshots: docs/design/customer-support/README.md; contracts: docs/specs/customer-support.md. Generative AI and T14 native UI remain future scope.

Support popup and typed handoff (2026-11-01): [x] lazy-loaded floating buyer chat with minimise/close, retained session drafts, simple first-message form, one conversation at a time and account history filters. Explicit typed human requests hand off on creation or reply without duplicate messages; button handoff and offline queue remain available. Auto-dismiss feedback, compact mobile Send label, notification deep links and Escape focus return verified. Nineteen targeted support integration tests, affected lint/types/builds and 360/768/1280 popup/staff browser checks pass. Local Docker updated and healthy; screenshots: docs/design/customer-support/README.md.

Support chat control correction (2026-11-01): [x] remove buyer Mark resolved, retain staff resolution and buyer reopen, hide empty action rows, and fix close/minimise hover/focus contrast with white surface/dark icons. Focused lint/format/UI types, buyer/admin builds and 360/768/1280 browser checks pass, including computed button/SVG colours. Local web/admin Docker updated. Screenshots: docs/design/customer-support/README.md. No backend or money-rule changes.

Support conversation row refinement (2026-11-01): [x] subject/SUP reference grouping, aligned status and WAT date/time, two-line titles, responsive metadata, whole-row hover/focus/selected treatment and retained staff context. Focused lint/format/UI types, buyer/admin builds and 360/768/1280 browser checks pass across All, Open, In Progress and Resolved, including long titles, alignment, selection and chat opening. Local web/admin Docker updated; screenshots: docs/design/support-conversation-rows/README.md. No API or money changes.

Entered bid rule and signed-in detail form (2026-11-01): [x] first bid at least start price, later entered bids/limits strictly higher by any safe integer kobo amount; automatic counterbid steps retained by explicit owner approval. Shared/API/Lua acceptance agrees, with new one-kobo/equal/lower/concurrent funded-bid tests. Remove three suggested prices and dropdown; radio method before amount, direct default, inline Bid now/Set limit and preserved fee review. Mobile shortcut preserves drafts; chat clears the sticky bid bar. 58 focused unit + 66 isolated bid integration tests pass (including 10,000 shared/Lua parity cases); affected lint/types/builds and 360/768/1280 browser checks pass. Local Docker updated. MONEY/BID CHANGE - needs human review. Screenshots: docs/design/lot-bid-entry/README.md; rules: docs/specs/bid-entry.md.

Bid form presentation refinement (2026-11-01): [x] desktop inline radios, compact warning surfaces, bold minimum/amount, numeric-money-only input, equal-width icon action, coloured total and read-only fee details popup. Conditional warning/funding action responds to insufficient/sufficient balances; refresh failure/retry retains drafts. Focused lint/format/UI types, buyer/admin builds and 360/768/1280 bid-form browser checks pass, including invalid input, popup disclosure without writes and balance transitions. Local Docker updated. Screenshots: docs/design/bid-form-polish/README.md. Server bidding, fee arithmetic and reservation rules unchanged; no full-site or unrelated financial tests rerun.

Auction fee label clarification (2026-11-01): [x] show configured Buyer premium (15%) and VAT on fees (7.5%) in fee details and confirmation, with plain-language service-charge/VAT-basis explanation. Rates read shared configuration; no financial arithmetic changed. Focused lint/formatting, UI/web/admin types/builds and 360/768/1280 bid-form browser checks pass. Local web/admin Docker updated; screenshots: docs/design/bid-form-polish/README.md.

Admin auction fee controls (2026-11-01): [x] Versioned Service charge, lot fee and VAT settings; audited, idempotent admin controls with session/MFA and stale-edit checks; atomic first-bid locking and stale-quote rejection; policy-specific reservations/settlement; live read-only buyer disclosure. Updates affect only auctions with no accepted bids; Buy Now tax stays separate. Targeted lint/types, 73 unit/concurrency checks, isolated fee integration, affected funding/persistence/closing/purchase regressions (including 1,000 lot closures), production builds and responsive browser checks pass. Two legacy regression fixtures were corrected and rechecked individually. Local Docker is updated; full CI checks remain enabled. Contract: docs/specs/auction-fee-controls.md. Screenshots: docs/design/auction-fees/README.md. MONEY/BID CHANGE - needs human review.

Receipt fee percentages (2026-11-01): [x] show Service charge and VAT percentages in HTML/plain-text receipts using each auction's locked rates, with compatible delivery of older queued receipts and unchanged Buy Now tax. Six email unit tests, two isolated fee integration tests and the targeted Mailpit receipt test pass; affected lint/types and API build pass. Local API Docker updated; previews at 360/768/1280: docs/design/email-fee-rates/README.md.

Upcoming Deals and wallet-backed pre-bids (2026-11-02): [x] separate scheduled catalogue and WAT launch countdowns, private reviewed limits, atomic hold replacement/cancellation, first-pre-bid fee pin, audited admin scheduling/rescheduling/cancellation and buyer notifications. Bounded restart-safe activation reuses funded holds behind the Redis launch fence and rechecks eligibility. Eleven isolated pre-bid integration/concurrency tests, 48 affected bid regressions, 31 closing/purchase regressions and 10 focused unit tests pass; affected lint/types/builds and buyer/admin browser workflows at 360/768/1280 pass. A real demo worker launch updated the open browser without manual refresh. Local Docker migrated; four upcoming demo lots added. Database dictionary, contracts and screenshots updated: docs/specs/upcoming-prebids.md and docs/design/upcoming-prebids/README.md. T14 native UI remains separate. MONEY/BID CHANGE - needs human review.

Pre-bid panel polish (2026-11-02): [x] larger price and labelled launch timer, calculated retail-estimate discount and strike-through, 50/50 numeric fixed-naira field/review button, and conditional filled Top up wallet action. Read-only balance refresh includes active replacement reservations; errors offer retry. Changed-file lint/formatting, UI/web types, buyer production build and targeted 360/768/1280 pre-bid browser workflows pass. Local buyer Docker updated; screenshots: docs/design/prebid-panel-polish/README.md. Server money/bid rules unchanged.

Catalogue heading alignment (2026-11-02): [x] UPCOMING DEALS and uppercase category names share ALL DEALS typography. Targeted lint/formatting, UI/web types, buyer build and nine computed-style/overflow browser checks at 360/768/1280 pass. Local buyer Docker updated; screenshots: docs/design/catalogue-headings/README.md.

Live bid review requests (2026-11-02): [x] private accepted commitment and binding-bid notice, retained Bid now, reason/acknowledgement dialog, one human-support conversation per buyer/lot and persistent status/actions on item detail and Bid History. Typed role/rate-limited Swagger endpoints reuse existing indexes; exact retries, owner/session checks and account isolation. Twenty-one relevant support API/realtime/worker tests, additional focused HTTP-role checks, changed-file lint/types, affected API/buyer builds and 360/768/1280 browser workflows pass. Local API/web Docker updated. No bid/ledger mutation, migration, dependency or environment change. Specs/screenshots: docs/specs/bid-cancellation-requests.md and docs/design/bid-cancellation-requests/README.md.

Bid request control correction (2026-11-02): [x] remove decorative/empty request boxes and hide ineligible controls; use filled red request action while preserving saved request status and binding-bid behaviour. Targeted lint/types, buyer build and 360/768/1280 browser checks pass, including empty-wrapper visibility and no bid/payment writes. Local buyer Docker updated; screenshots: docs/design/bid-request-controls/README.md. Cancellation fee remains pending owner clarification; no financial change implemented.

Staff-approved paid live bid cancellation (2026-11-02): [x] buyer fee consent, admin/MFA quote and explicit approval, pinned service-rate fee, ledger-only charge/release, leader reset with fresh bidding round and minimum ten-minute window, non-leader book preservation, permanent cancelled-buyer block, email/in-app/socket updates and crash-safe idempotent recovery. Migration 45 and database dictionary updated. Ten focused unit tests, nine isolated cancellation HTTP/socket/concurrency tests, 66 bid regressions, 21 support regressions and 11 pre-bid regressions pass. Affected lint/types/builds and buyer/admin browser workflows at 360/768/1280 pass; local Docker updated. Specs/screenshots: docs/specs/paid-bid-cancellation.md and docs/design/paid-bid-cancellation/README.md. MONEY/BID CHANGE - needs human review before production.

Cancellation request presentation correction (2026-11-02): [x] display basis points as 15% rather than 1500%, use support team wording, and hide completed cancellation request controls/dialogs after authoritative eligibility refresh. Socket stream changes trigger a private API read, with five-second silent fallback and existing focus/online/wallet updates. Changed-file lint, buyer types/build and responsive buyer browser checks pass, including socket-triggered removal within three seconds. Financial calculation unchanged.

Outbid cancellation-control correction (2026-11-02): [x] show live bid-review controls only while the authenticated socket confirms the buyer is current leader. Hide the panel and close an open dialog immediately on outbid or stale connection; restore the action on a fresh lead. Apply to item detail and Bid History through the shared buyer component. Existing support conversations remain in Customer Service. Targeted lint/types, buyer build and 360/768/1280 browser checks pass, including outbid transitions while private history remains stale and no money/bid writes. Local buyer Docker updated.

Personalised buyer homepage (2026-11-02): [x] normal login/signup redirects home while explicit local returns remain safe; signed-in first-name greeting and Watchlist/My Bids shortcuts replace the promotional hero/guide. Add four chronological Ending Soon items and conditional four-item Upcoming Deals; preserve Closing Now and admin-selected Top Deals without duplicate live lots. Upcoming stock refreshes silently and disappears when empty. Eleven focused home/return-path tests, changed-file lint, UI/web types and buyer/UI production builds pass. Browser checks cover signed-in/out 360/768/1280 views, four-item desktop selections, no duplicate live cards, empty/upcoming refresh and actual email-code sign-in returns. Local buyer Docker updated. Screenshots: docs/design/buyer-home/README.md. No money/bid processing changes.

Homepage four-card/header bell correction (2026-11-02): [x] four cards across all homepage rails/grids at 768 px and wider; preserve readable mobile layouts. Notification bell shares Watchlist border/shape, pointer and indigo hover/focus treatment; dropdown remains functional. Targeted lint/web types, UI/buyer build and 360/768/1280 browser checks pass, including computed four-column/card widths, bell border/hover/open and timer overflow. Added only missing labelled demo section stock with a guarded additive script; immediate rerun creates zero. Existing auctions/bids/wallets unchanged. Local buyer Docker updated; screenshots: docs/design/buyer-home/README.md.

T14 connection recovery (2026-11-02): local phone LAN health confirmed; approved offline bid-runtime recovery completed without changing ledger balances or reservations. Fifteen recovery tests and 29 funding/persistence regressions pass; API types/lint/build and fresh LAN Socket.IO lot snapshot checks pass. Final Expo Go countdown confirmation and remaining T14 acceptance are open. MONEY/BID CHANGE - needs human review. See docs/reviews/bid-runtime-recovery.md.

T14 launch refinement (2026-11-02): redesigned indigo/yellow launch canvas, Lucide auction illustration, bundled bold wordmark/tagline, reduced-motion-aware reveal/loading cue and session-readiness exit. Targeted lint/mobile types and Android/iOS exports pass. Native Android launch previews at 360/768/1280 updated in docs/design/mobile-home. Installed APK splash and overall T14 acceptance remain open.

T14 home polish (2026-11-02): compact search and promotion, circular shopping shortcuts, quieter section actions, 13 px two-line item names and exact-width two/four-column grids. Mobile-only lint/types/build and native responsive review are recorded in docs/design/mobile-home/README.md. Full T14 acceptance remains in progress.

T14 navigation/countdown correction (2026-11-02): explicit safe-area tab height, full five-label indigo navigation, working Login/More actions, Wallet in More and shared segmented auction timers across the native catalogue/detail/watchlist. Seven focused state tests, targeted lint/types and mobile exports pass; Android review/screenshots are in docs/design/mobile-navigation/README.md. Overall T14 remains in progress.

T14 local refresh incident (2026-11-03): Docker read-only filesystem/WSL startup failure recovered without resetting volumes. PostgreSQL completed recovery; the existing audited runtime workflow validated 59 events and one reservation, then resumed all services. pnpm mobile:check passes LAN HTTP and fresh Socket.IO snapshots. Low C: disk space remains a host action; overall T14 acceptance is unchanged. See docs/reviews/mobile-refresh-incident-2026-11-03.md.

T14 responsive shortcut polish (2026-11-03, in progress): branded horizontally scrollable home shortcuts implemented; existing two-column phone grid retained. Changed-file lint/mobile types pass. Native small-phone/font-scaling review and required screenshots are pending safe host disk headroom; do not mark fully verified. See docs/design/mobile-shortcuts/README.md.

T14 mobile hero correction (2026-11-03, in progress): filled Upcoming shortcut, two-slide signed-out hero and removal of repeated lower guide implemented. Changed-file ESLint and mobile typecheck pass. Real-phone swipe/autoplay/reduced-motion review and 360/768/1280 captures remain pending; no emulator recreated and overall T14 stays open.

T14 Browse correction (2026-11-03): added Upcoming to the scrolling collection tabs and reduced catalogue item titles to 13/18 px. Targeted ESLint/mobile types pass; physical-device visual confirmation and responsive captures remain pending. T14 remains in progress.

T14 item-detail polish (2026-11-03, in progress): responsive manual photo gallery, green signed-out bid action, 14 px reading text, tinted bid history and all shared condition badges implemented. Changed-file lint/mobile types pass. Physical-device swipe/zoom and responsive screenshot review remain open; T14 is not complete.

T14 condition badge correction (2026-11-03): shared palette/native badge applied to Home, Browse/Upcoming and item detail/condition guide. Targeted ESLint and mobile/shared UI types pass; physical-device visual review remains pending. T14 stays in progress.

Web badge follow-up (2026-11-03): aligned cards/detail/upcoming/policy condition badges to mobile palette. Changed-file lint, UI/web types and web production build pass; rendered colour checks and screenshots at 360/768/1280 pass. Local web container rebuilt/restarted only; T14 status unchanged.

T14 mobile auth refinement (2026-11-03, in progress): full-width inset-eye password fields, recovery without account tabs, separate email/2FA views and explicit recovery-code choice implemented. Four focused verification tests plus seven native-session regressions, changed-file lint and mobile typecheck pass. Physical Expo Go visual/auth walkthrough and responsive captures remain pending; T14 is not complete.

T14 guest More/settings correction (2026-11-03, in progress): guest bottom sheet, external help/policy/email actions, native settings and actual version footer implemented. Changed-file lint/mobile types and four focused public-environment tests pass; three linked web pages return HTTP 200. Physical-device sheet/browser/mail/settings walkthrough and responsive captures remain pending; T14 remains open.

T14 form keyboard correction (2026-11-03, in progress): scrollable Page forms now use shared keyboard avoidance and focused-field reveal; installed Android config explicitly uses resize. Changed-file ESLint/mobile types pass. Real-phone keyboard opening, switching between signup/password/code fields and closing-keyboard review remain pending; T14 stays open.

T14 keyboard follow-up (2026-11-03, in progress): first fix rejected by owner; replaced relative scroll helper/KAV with measured screen-coordinate overlap and explicit auth focus. Six focused geometry regressions, changed-file ESLint and mobile types pass. Running Expo Android bundle confirmed to include the new helpers. Physical-phone result and responsive captures remain pending; T14 remains open.

T14 dynamic keyboard follow-up (2026-11-04, in progress): Android sign-in switched to full-screen stack card; keyboard opening/field changes now position focused inputs higher with label space and existing overlap protection. Eight focused position tests, changed-file lint/mobile types pass. User asked to reopen the route and confirm actual password visibility; physical confirmation/screenshots remain pending. T14 remains open.

T14 keyboard resolution (2026-11-04): owner confirms both password and confirm-password fields are visible while typing after reload. Built-in KeyboardAvoidingView/ScrollView replacement, tap-outside dismissal and header-aware focus reveal pass changed-file ESLint/mobile typecheck; active Expo Android bundle includes the replacement. This closes the reported login/signup keyboard obstruction. Overall T14 and its remaining visual/device acceptance stay in progress.

T14 keyboard visibility reopened (2026-11-04): owner clarifies only the upper half of the textbox is visible; preceding closure is superseded. Added measured full-field focus clearance and keyboard-only bottom scroll space. Changed-file lint/mobile types pass. Entire password/confirm textbox and bottom-border visibility on the phone remains pending; do not mark the keyboard issue resolved yet.

T14 full-field keyboard acceptance (2026-11-04): owner explicitly confirms both complete password textboxes, including bottom borders, are visible while typing after the clearance update. Changed-file lint/types and served Android bundle checks pass. Reported keyboard obstruction is resolved; wider T14 acceptance remains open.

### [x] LotVanta brand migration ? source and local web/staff preview (2026-11-04)

Owner-approved identity applied across web/admin/mobile display text, supplied logos/favicons/app icon and launch assets, email/generated templates, invoices, notification wording and documentation. Operational identifiers and configured domains are intentionally retained. Targeted lint/types, 56 affected email/SMTP/auth-label/provider tests and web/admin/API production builds pass. Responsive web/admin brand review: docs/design/lotvanta-rebrand/README.md. New installed app name/icon/native splash require an EAS rebuild; Expo Go's own launcher remains Expo-owned. Overall T14 stays in progress.

[x] LotVanta web logo follow-up (2026-11-04): enlarged responsive header/footer logo, removed legacy dot styling and retained natural proportions. Targeted lint/UI types, web production build and browser checks/captures at 360/390/768/1280 pass, with no account-control overlap. Local website refreshed; see docs/design/lotvanta-logo-size/README.md.

[x] Demo stock expansion (2026-11-04): added 43 fresh sample auctions without modifying existing auctions or wallet entries. Public API verified 48 live, 20 Top Deals, 15 upcoming and 17 Buy Now-enabled live items. Repeat run created zero duplicates. New `pnpm demo:stock` command is restricted to the existing isolated local demo database; targeted ESLint/format checks pass. No UI or bidding/payment logic changed.

[x] Thirty-minute Closing Now window (2026-11-04): shared threshold and web timer updated, API/staff guidance aligned; 14 targeted home/native countdown tests, changed-file lint, shared UI types and web/API/admin production builds pass. Browser check verifies inclusive boundary, Top Deals exclusion, red/indigo timers, extensions, silent stock refresh, expiry and clock outage at 360/768/1280. Evidence: docs/design/home-live-thirty-minutes/README.md. Local web/API/admin updated; Expo uses the shared source on reload.

T14 LotVanta launch follow-up (2026-11-04): configured LV native splash, LV icon plus supplied LotVanta logo in app overlay, 2.4-second minimum logo visibility before readiness-gated exit, reduced-motion support and overlay touch blocking. Changed-file lint/mobile types pass. Physical launch screenshots and newly installed APK verification remain pending; do not claim native splash acceptance from Expo Go or bundle checks.

T14 launch polish correction (2026-11-04): transparent native/in-app LV artwork, transparent white/yellow brand name, larger bold yellow tagline and stronger entrance/icon breathing implemented. Targeted lint/mobile types and alpha-channel asset validation pass. Android bundle checked separately. Native installed splash/animation visual acceptance remains pending a new APK and physical-device review; no emulator recreated.

T14 launch edge/tagline follow-up (2026-11-04): corrected residual source/resampling black fringe and generated the complete scalable bold yellow slogan; app icon also uses cleaned artwork. Targeted lint/mobile type checks and pixel validation pass. No visible near-black pixels remain in generated launch artwork. Physical-device confirmation still required; earlier crop-only visual assumption is superseded.

T14 sparse closing/scroll follow-up (2026-11-04): full inner-width single Closing Now card, unchanged multi-card widths, memoized home cards with isolated countdown ticks and stable refresh/watch callbacks; removed outer shared form touch wrapper while retaining keyboard avoidance and drag dismissal. Nineteen targeted rail/price/countdown tests, lint and mobile types pass. Phone scrolling/keyboard visual confirmation remains pending; no emulator recreated.

T14 Account/More correction (2026-11-04): shared More sheet now opens for both session states; signed-in Account tab opens the existing complete buyer menu with an Account heading. Changed-file lint and mobile types checked; native phone navigation visual confirmation remains pending. No APK rebuild required for this JavaScript navigation change.

T14 source publication checkpoint (2026-11-04): owner requests all pending work committed/pushed. Includes remaining mobile routes/account/wallet/support/check-in/invoice screens, native session helpers and optional Expo push device registration/delivery with additive migration and typed API contracts. Three isolated push integration tests and 28 targeted mobile unit tests, changed-source lint/format, API/mobile/client/shared types and API build pass. Push remains off by default. Device screenshots, installed native splash verification, production hosting and broader T14 acceptance remain open; do not mark T14 complete. Secrets and ignored local artifacts are excluded from publication.

[x] Bid-method/action appearance correction (2026-11-04): inline mobile bidding selector avoids bottom-navigation overlap; compact method guidance; shared green bid/buy actions across web/mobile. Changed-file lint, mobile/UI/web types, served Android bundle and web production build pass. Browser verifies green/white Buy Now at 360/768/1280; evidence docs/design/green-bid-actions/. Mobile physical selector review pending. No money/bid logic changed.

T14 bidding dropdown follow-up (2026-11-04): owner rejects inline expanded rows; implemented anchored floating native menu with viewport-aware above/below placement, selected checkmark, outside/back dismissal and safe-area/large-text limits. Five targeted placement tests, lint and mobile types pass; Android bundle checked separately. Physical-device screenshots/appearance confirmation remain pending; no APK rebuild or money changes required.

[x] Mobile bidding type-size correction (2026-11-04): reduced dropdown text to 14px and compact method notice to 12px using existing tokens. Targeted lint/format and mobile types pass; phone visual confirmation remains pending.

T14 mobile bid-review polish (2026-11-04): redesigned the total-review sheet with item context, aligned fee rows, highlighted wallet reservation, mode-aware guidance and pinned confirm/edit footer. Changed-file formatting/lint, mobile types and Android bundle checks pass. No money/bid submission or calculation logic changed. Physical-device screenshots/visual confirmation remain pending.

T14 bid-review footer clearance (2026-11-04): owner accepts redesign but reports system-navigation overlap. Added a modal-local SafeAreaProvider/SafeAreaView around shared dialogs; no fixed device-specific offset. Changed-file lint/mobile types and Android bundle pass. Phone confirmation that Edit bid clears system buttons remains pending.

T14 mobile bid outcome correction (2026-11-04): review sheet remains open with green acceptance/Done, including outbid-on-arrival wording; failures remain visible in red and insufficient-funds code is preserved by bid API client. Guarded no-op conditions now show an explanatory message. Existing pending-request storage, idempotency and financial server behaviour remain unchanged. Fourteen scoped feedback/session tests, targeted lint/mobile-client types and Android bundle pass. Physical-device visual confirmation remains pending.

T14 mobile Buy Now feedback correction (2026-11-04): preserve checkout component/modal after lot closure instead of briefly showing then unmounting result. Added persistent paid/error/pending/late-credit screens, paid amount, View order/Done, safe retry guidance and typed insufficient-funds messages. Nineteen scoped feedback/review tests, lint/mobile/client types and Android bundle pass. No backend money/auction rules changed. Phone appearance/lifecycle confirmation remains pending.

T14 mobile activity badge/push wiring (2026-11-04): shared Watching/unread/pickup summaries, header/tab/account red badges, immediate confirmed mutation/read invalidation, silent foreground/reconnect/five-second fallback and outbid/push refresh; push receive/tap/cold-start routing, account-scoped opt-in restoration and EAS Firebase-file support. Thirteen scoped counter/session tests, targeted lint/mobile/client types and Android bundle pass. Owner confirms Firebase/FCM not configured; local API push disabled, so phone delivery remains pending setup/build/device verification. No money/bid rules, backend or migrations changed. Details: docs/specs/mobile-notifications.md.

T14 detail condition-badge correction (2026-11-04): bounded price/status text, wrapping detail heading row and capped condition badge width prevent right-edge clipping when opening Lost items. Existing palettes/auction data unchanged. Changed-file lint/types and Android bundling checked; phone visual confirmation pending.

[x] Mobile ended-state appearance (2026-11-04): red Ended indicator and hidden inactive bid/join controls/guidance, with stale winning label removed. Existing successful bid/Buy Now outcome modals persist. Changed-file lint/mobile types and scoped countdown regressions checked; phone visual confirmation pending. No backend bid or payment changes.

[x] Mobile bid-history type/layout correction (2026-11-04): smaller bidder/time labels, two-column detail history and bounded adaptive long-price text; account history amounts match. Changed-file lint/mobile types and Android bundle pass; physical-device visual confirmation pending. No bid/data changes.

[x] Mobile View pre-bid colour correction (2026-11-04): green/white home/upcoming catalogue actions. Targeted lint/format/mobile types checked; no pre-bid logic changes.

T14 customer service UI correction (2026-11-04): scrollable/stretching tabs, coloured status badges, larger fixed chat composer and green support action implemented. Targeted lint/mobile types/Android bundle pass; phone keyboard/visual confirmation pending.

T14 support keyboard follow-up (2026-11-04): explicit measured keyboard-top viewport for expanded support popup; targeted lint/types/Android bundle pass. Phone confirmation remains pending.
