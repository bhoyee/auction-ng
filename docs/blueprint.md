# Nigerian Liquidation Auction Platform — Technical Blueprint

Place this file at `docs/blueprint.md`. It is the Markdown copy of the online blueprint doc (as of 18 October 2026), with the two diagrams written out as text so AI agents can read them. If the online doc changes, update this file too.

Related files: `AGENTS.md` (agent rules), `docs/TASKS.md` (build tasks), `docs/DESIGN.md` (brand and UX), `docs/decisions.md` (decision log).

## Summary

Build a daily liquidation-auction marketplace for Nigeria: thousands of returned, overstock and shelf-pull items listed each day from ₦500, bid on from web and mobile, collected from a warehouse or delivered by a logistics partner. It copies the proven MAC.BID loop (cheap starts, fast-closing lots, pickup hubs, membership perks) and adapts payments, fulfilment and compliance to Nigeria.

Key decisions in this blueprint:

- **One TypeScript codebase** (monorepo) for web (Next.js), mobile (React Native + Expo) and backend. One language is the single biggest speed-up when Claude or Codex writes most of the code.
- **A dedicated bid engine** that accepts a bid in under 50 ms server-side: Redis for live auction state with atomic scripts, PostgreSQL as the system of record, WebSockets to push price changes to every viewer.
- **Wallet-first payments**: each buyer gets a personal bank account number (Paystack Dedicated Virtual Account) to top up by transfer, which is how most Nigerians pay online. Cards are a secondary option.
- **Pickup first, delivery second**: warehouse pickup with QR codes at launch; delivery quotes from a logistics partner's API added in phase 2.
- **Licensing before launch**: in Lagos, auctions must be run by an auctioneer licensed by the State Ministry of Commerce, so the licence sits on the critical path, not the tech.
- **AI builds it, humans own the money code**: Claude/Codex write the features from small, test-backed tasks; a human reviews every change to bidding, wallet and payouts before it ships.

## Business model and Nigeria adaptations

Revenue comes from the gap between what you pay for liquidation stock and the winning bid, plus a buyer premium, lot fees, delivery margin and memberships. The table maps each MAC.BID mechanic to its Nigerian version.

| Mechanic | MAC.BID (US) | Nigerian version |
| --- | --- | --- |
| Starting price | $1 per lot | ₦500 or ₦1,000 per lot (test both) |
| Auction length | Daily lots, staggered close times | Same; lots close one per 10–30 seconds from 7pm so evenings feel like a live event |
| Closing rule | Extended bidding near the end | Soft close: a bid in the last 2 minutes resets the clock to 2 minutes |
| Bidding | Max (proxy) bids | Owner-approved amendment: direct bids by default; optional automatic bids require an explicit private spending limit |
| Fees | Buyer premium + lot fee | 15% buyer premium + ₦300 lot fee (to tune), VAT on fees (confirm the current rate with an accountant) |
| Paying | Card on file, charged on win | Wallet topped up by bank transfer to a personal account number; card as backup |
| Fulfilment | Pickup at 20+ locations | Pickup at a Lagos hub first (e.g. Ikeja or Lekki), then Abuja and Port Harcourt; delivery by partner |
| Storage deadline | Short pickup window | 5 days free, then a daily storage fee, then forfeit after 10 days |
| Membership | Buyer's Club: early pickup access, perks | Monthly plan: lower buyer premium, free delivery on some lots, early pickup slots |
| Special formats | Instant Win, Turbo Clock, Final Frenzy, pallets | Phase 2–3: buy-now lots, fast 60-second lots, bulk pallets for traders and resellers |
| Licence | State rules | Licensed auctioneer under the [Lagos State Auction Law 2015](https://lagosmepb.org/wp-content/uploads/GUIDELINES-FOR-AUCTION-LICENSE1.pdf), issued by the Ministry of Commerce, Cooperatives, Trade and Investment |

**Nigeria-specific points to design for**

- **Resellers are a core segment.** Many buyers will flip items on Instagram, WhatsApp and Jiji. Pallet lots, bulk invoices and a trader tier make them loyal.
- **Trust is the product.** Show real photos of each item, a condition grade (New, Like new, Open box, Damaged, Untested), and what is missing. Publish a "Wall of wins" with real winners and prices.
- **Non-paying winners kill auctions.** Requiring wallet balance (or a held deposit) before bidding above a threshold removes most fake and joke bids.
- **Supply is the hard part.** Line up stock first: e-commerce returns (Jumia, Konga sellers), retail chains, importers, bank and insurance salvage, and US/UK return pallets shipped in.

## Feature scope by phase

The MVP is the smallest loop that takes money: list items, bid, win, pay from wallet, pick up. Everything else waits until that loop runs daily without staff fixing things by hand.

| Area | MVP (launch) | Phase 2 | Phase 3 |
| --- | --- | --- | --- |
| Accounts | Phone + OTP sign-up, profile, BVN check for wallet | Email login, referral codes | Trader/business accounts, team logins |
| Browsing | Home feed, categories, search, filters, Ending soon | Recommendations, saved searches with alerts | Personalised daily digest |
| Auctions | Live lots, max bids, soft close, watchlist, outbid push alerts | Buy-now lots, fast 60-second lots | Pallet and bulk lots, charity auctions |
| Wallet and payments | Personal account number top-up, auto-debit on win, invoices, refunds to wallet | Card payments, withdraw to bank | Gift credit, instalments for traders |
| Fulfilment | One pickup hub, QR pickup pass, pickup slot booking | Partner delivery with live quote and tracking | Multiple hubs, transfers between hubs |
| Membership | — | Paid monthly plan with lower fees | Rewards points, tiers |
| Trust | Condition grades, photo galleries, ratings of item accuracy | Disputes and returns flow | Public win wall, seller programme |
| Admin (staff) | Lot intake with photos, bulk upload, schedule auctions, pickup desk scanner, refunds | Fraud flags, user strikes, reports | Supplier portal, warehouse bin locations |
| Platforms | Responsive web + Android + iOS | WhatsApp notifications | USSD or SMS bidding for low-data users (test demand) |

Test on Android first, since most Nigerian buyers use Android phones; ship both apps from the same Expo codebase.

## Brand and UX design

The product must look professionally designed for Nigerian buyers, not generated. The full rules live in `docs/DESIGN.md`; the direction in short:

- **Idea:** the evening market, online. Energy comes from live prices and countdowns, not decoration.
- **Colour:** deep adire indigo for brand and actions; danfo-bus yellow used only for live and closing signals; cool grey canvas; green for winning, red for outbid.
- **Type and icons:** Schibsted Grotesk throughout, tabular numbers for prices; Lucide icons; real product photos only.
- **Signature element:** a "Closing now" row of live lots at the top of the home page.
- **UX rules:** bid in two taps, total cost shown before confirming, never a stale price, every screen designed for loading, empty, error and offline states.
- **Process:** approve mockups of the key screens and build the design system (task D01) before any screen is coded; agents screenshot and self-review every screen against a checklist of "AI-generated" tells.

## Architecture for speed

Speed comes from three choices: pages served from a CDN edge close to Lagos, a bid path that touches memory (Redis) and never waits on a slow query, and live updates pushed over WebSockets instead of apps polling. Start as one well-structured backend (a modular monolith) plus a separate real-time gateway; split services only when load proves you need to.

**System diagram (text version)**

```
   [Web app (Next.js)]     [Mobile app (Expo)]     [Staff admin]
            |                       |                     |
            v                       v                     v
   +--------------------------------------------------------------+
   |   Cloudflare edge: CDN, cached pages, resized images (R2)    |
   +--------------------------------------------------------------+
                     | HTTPS                       | WebSocket
                     v                             v
 [External services] <-- [Backend API (NestJS)]    [Real-time gateway]
  Paystack, GIG,          auth, lots, wallet,       Socket.IO + Redis
  Termii SMS, Expo push   orders                    adapter
                     | place bid                   ^ price updates
                     v                             | (pub/sub)
                  +-------------------------------------+
                  |  Bid engine (Redis)                 |
                  |  atomic bid script, live state,     |
                  |  pub/sub                            |
                  +-------------------------------------+
                     | bid stream
                     v
            [Workers (queues)] --save--> [PostgreSQL] --index--> [Search (Meilisearch)]
            save bids, close lots,       system of record
            alerts
```

The API also reads and writes PostgreSQL for everything outside the live bid (accounts, wallet ledger, orders); only bids skip the database on the way in.

**How a bid is processed**

1. The app sends the bid over its open WebSocket (or HTTPS fallback) with an idempotency key, so a retry on a weak network never places two bids.
2. The bid engine runs one atomic Redis script: checks the lot is open, the amount meets the increment, the bidder has enough wallet balance held, then resolves max bids and updates the high bid.
3. If the bid lands in the last 2 minutes, the same script pushes the close time back (soft close).
4. The engine publishes the new price to Redis pub/sub; the real-time gateway fans it out to everyone watching that lot within a few hundred milliseconds.
5. The bid is written to a durable queue (Redis Streams or BullMQ) and saved to PostgreSQL by a worker, so the database never slows the bid path.
6. The outbid user gets a push notification; the bidder sees the confirmed state.

**Closing lots**

A scheduler closes each lot at its exact time, freezes the result in PostgreSQL, debits the winner's wallet, creates the invoice and pickup pass, and notifies the winner. Closing is idempotent: if it runs twice, nothing is charged twice.

**Keeping it fast for browsers**

- Catalogue pages are pre-rendered and cached at the edge, refreshed every few seconds; only the live price and timer come over the socket.
- Images are resized to WebP/AVIF at several widths and served from the CDN; list pages load small thumbnails.
- Search runs on a dedicated engine (Meilisearch or Typesense), not SQL `LIKE` queries.
- Timers on the client count down from the server's clock offset, so every phone shows the same close time.

## Tech stack

Everything is TypeScript in one monorepo so web, mobile and backend share types, validation and API clients. These are mainstream tools that AI coding agents know well, which matters as much as raw performance. (AGENTS.md §2 has the final, binding choices.)

| Layer | Choice | Why |
| --- | --- | --- |
| Monorepo | pnpm + Turborepo | Shared packages, one install, cached builds |
| Web app | Next.js (App Router) + Tailwind | Server rendering and edge caching for fast first load and SEO |
| Mobile app | React Native + Expo (EAS builds and over-the-air updates) | One codebase for Android and iOS; ship fixes without store review |
| Shared UI and logic | Shared packages: types, Zod schemas, API client, bid-increment rules | Web and mobile can never disagree on rules |
| Backend API | NestJS on Node.js | Clear modules (auth, lots, bids, wallet, orders) that agents can work on separately |
| Real-time | Socket.IO with Redis adapter | Auto-reconnect on weak networks; scales across servers |
| Bid engine state | Redis (Lua scripts), Redis Streams / BullMQ for queues | Atomic bids in memory, durable hand-off to the database |
| Database | PostgreSQL + Prisma | Reliable money records, migrations agents can generate |
| Search | Meilisearch | Instant, typo-tolerant search and filters |
| Images and CDN | Cloudflare (CDN, R2 storage, image resizing) | Edge close to Nigerian users, cheap storage |
| Hosting | One VPS with root access (Hetzner, DigitalOcean, Vultr, Contabo or UpCloud), everything in Docker Compose, managed with Coolify or Dokploy | Cheap and fully under your control; cPanel or shared hosting cannot run Redis, workers or WebSockets |
| Payments | Paystack (virtual accounts, cards, payouts); Flutterwave or Monnify as backup | Bank transfer is the main way Nigerians pay online |
| SMS/OTP | Termii or similar Nigerian SMS provider, WhatsApp as a channel later | Reliable delivery to Nigerian networks, including DND numbers |
| Push | Expo Notifications (FCM/APNs) | Outbid and win alerts |
| Identity (KYC) | BVN/NIN check through Paystack or a provider such as Smile ID, Dojah or Prembly | Required for virtual accounts; cuts fraud |
| Delivery | GIG Logistics API first; compare Sendbox, Kwik and others | Rate quotes, booking and tracking |
| Observability | Sentry, Grafana/Prometheus or Better Stack, PostHog for product analytics | See slow bids and crashes before users complain |
| Testing | Vitest, Playwright (web), Maestro (mobile), k6 (load tests) | Agents write tests with each feature |

Avoid microservices, Kubernetes and GraphQL at launch. They slow an AI-assisted build and add little until you have real scale.

## Hosting and deployment

The whole backend runs on one VPS in Docker containers, behind Cloudflare. Shared or cPanel hosting (including "cloud hosting" plans with dedicated cores) won't work: it gives no root access, so Redis, PostgreSQL, always-on workers and WebSockets can't run. Keep that kind of plan only for company email or a landing page.

| Container | Runs |
| --- | --- |
| caddy | HTTPS certificates; routes traffic to web, admin, api and realtime |
| web | Next.js buyer website |
| admin | Next.js staff dashboard |
| api | NestJS backend |
| realtime | Socket.IO gateway |
| worker | Bid persistence, lot closing, notifications, reconciliation |
| postgres | Main database |
| redis | Bid engine state and queues |
| meilisearch | Search |

The mobile app is not hosted on the server: Expo builds go to the Play Store and App Store and call the api and realtime containers.

| Stage | Server size | Rough price |
| --- | --- | --- |
| Build and staging | 2 vCPU, 4 GB RAM, 40+ GB SSD | $5–15/month |
| Launch | 4 vCPU, 8 GB RAM, 80+ GB SSD | $15–40/month |
| Growth | Move PostgreSQL to its own server or a managed service, add a second app server | Scale when load tests or metrics say so |

**How deployment works**

1. Develop locally with the same `docker-compose.yml`.
2. Install Coolify (or Dokploy) on the VPS once and connect the GitHub repo.
3. Each merge to `main` builds the images and deploys to staging; production deploys on a tagged release.
4. Secrets (Paystack keys, database passwords) live in the panel's environment settings, never in Git.

**Non-negotiable from day one**

- Daily PostgreSQL backups copied off the server to Cloudflare R2, with a restore tested every month.
- Server firewall: only ports 22, 80 and 443 open; SSH by key only.
- Uptime checks and error alerts (Sentry, Better Stack or similar) sent to your phone.

## Data model

Fifteen core tables cover the MVP (T02 in `docs/TASKS.md` adds a few supporting tables such as invoice_lines, strikes and idempotency_keys). Money is stored as integer kobo (₦1 = 100 kobo), never as decimals, and the wallet is a double-entry ledger: balances are calculated from entries, never edited directly.

| Table | Holds | Key fields |
| --- | --- | --- |
| users | Buyers and staff | phone, name, email, role, kyc_status, strikes, membership_tier |
| wallets | One per user | user_id, available_kobo, held_kobo (cached from ledger) |
| ledger_entries | Every money movement | wallet_id, type (topup, hold, release, debit, refund, payout), amount_kobo, reference, idempotency_key |
| virtual_accounts | Personal top-up account numbers | user_id, bank, account_number, provider_ref |
| payments | Incoming transfers and card charges | provider, provider_ref, amount_kobo, status, raw_webhook |
| locations | Pickup hubs | name, address, hours, capacity_per_slot |
| lots | Each item for auction | title, description, condition, retail_price, images, category_id, location_id, start_price, start_at, end_at, status |
| lot_images | Photos | lot_id, url, order |
| categories | Browsing tree | name, slug, parent_id |
| bids | Every accepted bid | lot_id, user_id, amount_kobo, max_kobo, is_proxy, created_at |
| watchlist | Saved lots | user_id, lot_id |
| invoices | One per win (or batch of wins) | user_id, lots, hammer_total, premium, fees, vat, total, status |
| fulfilments | Pickup or delivery | invoice_id, type, slot_at, qr_token, courier, tracking_no, status |
| notifications | Sent alerts | user_id, channel, template, payload, sent_at |
| audit_log | Staff and system actions | actor_id, action, entity, before, after |

Generate this as the first migration, with indexes on `lots(status, end_at)`, `bids(lot_id, amount_kobo desc)` and unique `ledger_entries(idempotency_key)`.

## Payments, wallet and fulfilment flows

The wallet is the centre of the money flow: buyers top up by bank transfer, bids hold funds, wins debit them, and refunds go back to the wallet in seconds.

**Wallet top-up**

1. After phone OTP, the buyer opts in to a wallet and gives their BVN. Paystack's [Dedicated Virtual Accounts](https://paystack.com/docs/payments/dedicated-virtual-accounts/) need the customer's express consent and personal details, and are only available to a registered Nigerian business.
2. The backend asks Paystack for a permanent account number for that buyer (Wema or Titan partner banks) and shows it in the app.
3. The buyer transfers from any bank app. Paystack sends a webhook; the backend verifies the signature, re-checks the transaction with Paystack's API, and writes a `topup` ledger entry once per reference.
4. Plan for bank delays: one partner bank had [about 23 hours of delayed credits](https://status.paystack.com/en-us/cmg4yvt0a00gk0nosdx8od7ph-15xyp91g6jz8) in September 2025. Offer a second bank or card top-up, and show "transfer pending" clearly.

**Bidding and winning**

- Placing a max bid holds that amount plus estimated premium in the wallet. Being outbid releases the hold.
- On win, the hold becomes a debit and an invoice is created. Buyers with low balance get 24 hours to top up, then the lot goes to the next bidder or relists, and the buyer gets a strike. Three strikes suspend bidding.
- Card payments (phase 2) charge the same invoice through Paystack checkout.

**Pickup**

1. The winner books a pickup slot at the hub; the app shows a QR pass listing every lot in the invoice.
2. Warehouse staff scan the QR on a tablet or phone, the app shows bin locations and photos, staff hand over and tap Collected.
3. Uncollected after 5 days: storage fee; after 10 days: forfeit and relist, with refund rules stated in the terms.

**Delivery (phase 2)**

1. At checkout the buyer picks Delivery and enters an address; the backend requests a quote from the partner's API (GIG Logistics' API supports rate calculation, shipment scheduling, tracking and cash on delivery).
2. You add your margin and show one price; the buyer pays from the wallet.
3. Staff pack the order, the courier collects from the hub, and tracking updates come back by webhook into the order page and push alerts.
4. Build a `DeliveryProvider` interface so a second courier (or your own riders in Lagos) can be added without touching checkout.

**Payouts and refunds**

Refunds go to the wallet first (instant, free). Withdrawals to a bank account use Paystack Transfers, need a verified account name match, and are limited per day to slow fraud.

## Performance targets and network realities

"Very fast" has to be measured on a mid-range Android phone on a patchy mobile connection in Lagos, not on a laptop on office Wi-Fi. These targets are written into AGENTS.md and checked in CI where possible.

| Measure | Target |
| --- | --- |
| Bid accepted, server side (p95) | under 50 ms |
| Price update reaching other viewers (p95) | under 500 ms |
| Web home page, Largest Contentful Paint on 4G | under 2.5 s |
| Web JavaScript sent on first load | under 200 KB compressed |
| Mobile app cold start on a mid-range Android | under 3 s |
| Android app download size | under 30 MB |
| Concurrent viewers on one closing lot (load test) | 5,000 |
| Bids per second across the platform (load test) | 1,000 |
| Uptime during evening closing hours | 99.9% |

**Designing for Nigerian conditions**

- **Flaky connections**: the app must reconnect sockets silently, resend bids safely (idempotency keys), and show "reconnecting" rather than a stale price.
- **Data cost**: thumbnails under 30 KB, a "data saver" mode, no autoplay video, cache images on the phone.
- **Low-end phones**: lists use virtualised rendering (FlashList), animations stay light, test on a 2–3 GB RAM Android.
- **Clock drift**: phones have wrong clocks; all countdowns use the server time sent on connect.
- **Peak spikes**: evening closings bring traffic bursts; stagger close times and load-test the closing window before every big sale.

## Security, fraud and compliance

Three areas need attention before launch: the auctioneer licence, data protection registration, and fraud controls on the wallet. Get a Nigerian lawyer to confirm the legal items; this section is a checklist, not legal advice.

**Legal and regulatory**

- **Auctioneer licence**: the Lagos State Auction Law 2015 requires every auction in the state to be run by an auctioneer licensed by the Ministry of Commerce, Cooperatives, Trade and Investment. Companies apply in writing with their incorporation certificate and director details ([guidelines](https://lagosmepb.org/wp-content/uploads/GUIDELINES-FOR-AUCTION-LICENSE1.pdf)). Check the equivalent law in each state where you open a hub.
- **Data protection**: the Nigeria Data Protection Act 2023 and the NDPC's GAID, in force since 19 September 2025, are now the governing rules ([DLA Piper summary](https://privacymatters.dlapiper.com/2025/06/nigeria-ndpc-issues-gaid-key-compliance-insights/)). Expect to appoint a Data Protection Officer, register with the NDPC if you qualify as a controller of major importance, run a compliance audit, publish a clear privacy policy, and do a DPIA because you process BVNs.
- **Business registration**: a registered company with CAC is needed for Paystack virtual accounts and for the licence.
- **Consumer terms**: clear rules on condition grades, "as is" sales, returns, storage fees, forfeits and buyer premium, shown before the first bid.

**Security controls**

- Email OTP login with device binding and verified email before bidding (owner-approved interim policy, 2026-10-26); phone verification comes later. PIN or biometrics to confirm withdrawals.
- All payment webhooks verified by signature and re-checked against the provider's API before crediting.
- No card numbers stored; BVN stored encrypted and masked, readable only by the KYC service.
- Staff admin behind SSO and two-factor, every action in the audit log, role-based permissions (intake, warehouse, finance, support).
- Rate limits on login, OTP, bids and withdrawals.

**Fraud and fair bidding**

- **Shill bidding**: staff and suppliers cannot bid; flag accounts sharing devices, BVNs or bank accounts that bid on the same lots.
- **Multi-accounting and OTP abuse**: one wallet per BVN, device fingerprinting, SIM-swap checks for withdrawals where the provider supports them.
- **Wallet laundering**: cap withdrawals of funds that were topped up but never spent; review large top-ups.
- **Non-payment**: strikes and bidding limits based on account history.

## Building it with Claude or Codex

AI agents build well when the repo tells them the rules and each task is small, specific and checked by tests. They build badly from "make me MAC.BID". You still need at least one person who can read code, run the apps, and review every change to money and bidding.

The repo layout, commands and rules are in `AGENTS.md`. The task-by-task plan with acceptance criteria is `docs/TASKS.md`. Prompts to start and continue the work are in `KICKOFF_PROMPTS.md`.

**Guardrails**

- Use Git with a pull request per task; let the agent explain each change; merge only when CI is green.
- Ask a fresh agent session to review risky pull requests without seeing the original conversation.
- Keep `docs/decisions.md` up to date so later sessions don't undo earlier choices.
- Run Paystack in test mode until the end-to-end flow (top up, bid, win, pick up, refund) passes repeatedly.

## Roadmap, costs, risks and next steps

A realistic target is a private beta about 15 weeks after starting and a public Lagos launch around week 19, if the licence and payment approvals run alongside the build. These timings are estimates for one or two people directing AI agents full time.

**Roadmap (text version)**

| Phase | When | What happens | Gate to move on |
| --- | --- | --- | --- |
| Foundations | Weeks 1–4 | Register company, apply for auction licence, open Paystack; line up first stock supplier and a Lagos hub; set up repo | Licence granted, virtual accounts approved |
| MVP build | Weeks 3–14 | Bid engine, wallet, web and mobile apps, admin, pickup; built task by task with Claude/Codex, human review on money | Top-up, bid, win, pickup and refund pass end to end |
| Private beta | Weeks 15–18 | 50–100 invited buyers, real small lots, daily closings; load test the closing window; fix payment edge cases | Non-payment under 5%, closings stable under load |
| Lagos launch | Week 19 on | Public launch to bargain hunters and resellers; daily auctions from one pickup hub | Hub runs daily without manual fixes |
| Grow | Months 6–12 | Phase 2: delivery, cards, membership, buy-now lots. Phase 3: pallets, more hubs (Abuja, Port Harcourt), traders | — |

**Running costs at launch (approximate, verify before budgeting)**

| Item | Rough monthly cost |
| --- | --- |
| VPS running everything in Docker (see Hosting and deployment) | $5–40, plus a few dollars for off-server backups |
| Cloudflare CDN, R2 storage, image resizing | $0–100 |
| Search, monitoring, error tracking | $0–150 |
| SMS OTP and notifications | Depends on volume; budget per message |
| AI coding tools (Claude and/or Codex plans) | $100–400 per builder |
| App stores | Apple $99 a year, Google Play $25 once |
| Payment and delivery fees | Per transaction, passed into buyer premium and delivery price |

The big costs are not technical: stock, the warehouse, staff for intake and pickup, and marketing.

**Main risks**

| Risk | Mitigation |
| --- | --- |
| Not enough good stock | Sign two suppliers before building past the MVP |
| Bidders who don't pay | Wallet holds, strikes, bidding limits for new accounts |
| Bank transfer delays | Two virtual-account banks, card top-up as backup, clear pending states |
| AI-written bugs in money code | Ledger design, tests first, human review, test-mode payments until stable |
| Slow or crashing closings | Load tests before each big sale, staggered close times |
| Licence or data protection gaps | Lawyer review in weeks 1–4, DPO appointed before launch |

**Sources**

- [MAC.BID home page](https://www.mac.bid)
- [Paystack: Dedicated Virtual Accounts](https://paystack.com/docs/payments/dedicated-virtual-accounts/)
- [Paystack status: Wema DVA delays, Sept 2025](https://status.paystack.com/en-us/cmg4yvt0a00gk0nosdx8od7ph-15xyp91g6jz8)
- [Lagos State: guidelines for obtaining an auctioneer's licence](https://lagosmepb.org/wp-content/uploads/GUIDELINES-FOR-AUCTION-LICENSE1.pdf)
- [DLA Piper: NDPC issues GAID](https://privacymatters.dlapiper.com/2025/06/nigeria-ndpc-issues-gaid-key-compliance-insights/)
- [GIG Logistics Delivery plugin (API features)](https://wordpress.org/plugins/gig-logistics-delivery/)
