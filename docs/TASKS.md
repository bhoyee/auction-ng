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

Simplified app banner (2026-10-27): owner removes the phone and extra labels/link. Spread copy and clickable store badges across the banner; use general store pages pending Auction NG listing URLs. [Revised previews](design/app-banner-simple/README.md). T14 unchanged; T13 remains open.

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

### [ ] T14 — Mobile app

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
