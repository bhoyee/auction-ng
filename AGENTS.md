# AGENTS.md — Auction NG

Rules for AI coding agents (Claude Code, Codex, others) working in this repository.
Read this file fully before every task. If anything here conflicts with a task prompt, stop and ask.

## 1. What we are building

A daily liquidation-auction marketplace for Nigeria (similar to MAC.BID in the US):

- Thousands of items (returns, overstock, shelf pulls) listed daily, starting from ₦500.
- Buyers bid from the **web app** and the **mobile app** (Android first, iOS too).
- Winners pay from a **wallet** topped up by bank transfer (Paystack Dedicated Virtual Accounts).
- Winners **collect from a warehouse** (QR pickup pass) or, later, get **delivery** through a logistics partner.
- Staff use an **admin dashboard** to add lots, schedule auctions, run the pickup desk and handle refunds.

The full blueprint is in `docs/blueprint.md`. The ordered task list is in `docs/TASKS.md`.
Past decisions are in `docs/decisions.md` — never undo a recorded decision without asking.

**Top priorities, in order:** correctness of money and bids → speed → simplicity → features.

## 2. Tech stack (do not add or swap frameworks without approval)

| Area | Choice |
| --- | --- |
| Language | TypeScript everywhere, `strict: true` |
| Runtime | Node.js 22 LTS |
| Package manager / monorepo | pnpm workspaces + Turborepo |
| Web (buyers) | Next.js (App Router) + Tailwind CSS — `apps/web` |
| Admin (staff) | Next.js (App Router) + Tailwind CSS — `apps/admin` |
| Mobile | React Native + Expo (EAS, expo-router) — `apps/mobile` |
| Backend API | NestJS — `apps/api` |
| Real-time | Socket.IO + Redis adapter — `apps/realtime` |
| Background jobs | BullMQ workers — `apps/worker` |
| Database | PostgreSQL 16 + Prisma |
| Cache / bid engine / queues | Redis 7 (Lua scripts for bids) |
| Search | Meilisearch |
| Validation | Zod (schemas shared in `packages/shared`) |
| Images | Cloudflare R2 (S3 API) + Cloudflare image resizing |
| Payments | Paystack (virtual accounts, transfers, cards) behind a `PaymentProvider` interface |
| SMS / OTP | Termii behind an `SmsProvider` interface |
| Push | Expo Notifications |
| Delivery (phase 2) | GIG Logistics behind a `DeliveryProvider` interface |
| Tests | Vitest (unit/integration), Playwright (web e2e), Maestro (mobile e2e), k6 (load) |
| Hosting | One VPS, all services in Docker Compose, deployed with Coolify, Cloudflare in front |

Not allowed without written approval: microservices beyond the apps above, Kubernetes, GraphQL, MongoDB, a second ORM, a second UI framework, paid SaaS dependencies.

## 3. Repository layout

```
apps/
  web/         Next.js buyer site            (port 3000)
  admin/       Next.js staff dashboard        (port 3001)
  api/         NestJS REST API                (port 4000)
  realtime/    Socket.IO gateway              (port 4001)
  worker/      BullMQ workers (no HTTP)
  mobile/      Expo app
packages/
  shared/      Types, Zod schemas, money maths, bid increments, fee rules, constants
  api-client/  Typed client for the API, used by web, admin and mobile
  ui/          Design tokens and shared web components
  config/      Shared ESLint, TypeScript and Tailwind configs
infra/
  docker/      Dockerfiles
  Caddyfile
  backup/      Backup and restore scripts
docs/
  blueprint.md  decisions.md  TASKS.md  DESIGN.md  design/ (mockups)  specs/
docker-compose.yml        Local and production services
.env.example              Every environment variable, with comments (no real secrets)
```

Business rules that both server and clients need (increments, fees, condition grades, statuses) live **only** in `packages/shared`. Never copy them into an app.

## 4. Commands

```
pnpm install                 # install everything
docker compose up -d postgres redis meilisearch   # start local services
pnpm db:migrate              # apply Prisma migrations
pnpm db:seed                 # seed demo data (200 lots, 20 users)
pnpm dev                     # run web, admin, api, realtime, worker in watch mode
pnpm --filter mobile start   # run the Expo app
pnpm lint                    # ESLint + Prettier check
pnpm typecheck               # tsc --noEmit across the repo
pnpm test                    # unit + integration tests
pnpm test:e2e                # Playwright
pnpm build                   # production build of all apps
```

If a command is missing or broken, fix it as part of your task and mention it.

## 5. Money rules (critical — break none of these)

1. **All money is an integer number of kobo** (₦1 = 100 kobo). Type: `number` checked with `Number.isSafeInteger`, or `bigint` in the ledger. Never floats, never `Decimal` strings in business logic. Format to Naira only at the UI edge with `formatNaira()` from `packages/shared`.
2. **The wallet is a double-entry ledger.** Every change is a row in `ledger_entries`. Balances are derived from entries. A cached balance column may exist, but only the ledger service updates it, in the same database transaction as the entry.
3. **Only `apps/api/src/ledger` writes ledger entries.** No other module, worker or script touches ledger tables directly.
4. **Every money-moving operation has an idempotency key** stored with a unique constraint. Retrying the same request must never move money twice.
5. **Webhooks are untrusted until verified:** check the provider signature, then re-fetch the transaction from the provider's API, then credit once per provider reference.
6. **Money operations run in database transactions** with row locks (`SELECT … FOR UPDATE`) on the wallet.
7. **No negative available balances.** Holds and debits must check available funds inside the transaction.
8. **Fee maths lives in `packages/shared/src/fees.ts`** and is covered by table-driven tests. Rounding: round half up to the nearest kobo, applied once per line item.
9. Never log full card data, BVNs, OTPs, passwords or secret keys. Mask BVN as `*******1234`.
10. Never call live payment endpoints. Use Paystack **test** keys only. Live keys are set by a human in production.

## 6. Auction and bid rules

All values below are defaults; they live in `packages/shared/src/auction-rules.ts` and must be configurable.

**Bid increments (current price → minimum increment):**

| Current price | Increment |
| --- | --- |
| below ₦5,000 | ₦100 |
| ₦5,000 – ₦19,999 | ₦250 |
| ₦20,000 – ₦49,999 | ₦500 |
| ₦50,000 – ₦199,999 | ₦1,000 |
| ₦200,000 – ₦499,999 | ₦2,500 |
| ₦500,000 and above | ₦5,000 |

**Proxy (max) bidding:**
- A bidder submits a maximum. The system bids for them only as much as needed to lead.
- First bid on a lot: current price = start price; the bidder leads.
- New max greater than the leader's max: new bidder leads; price = min(new max, leader's max + increment).
- New max less than or equal to the leader's max: leader stays; price = min(leader's max, new max + increment).
- Equal maxima: the earlier bid wins.
- A leader may raise their own max; the price does not change.
- A bid must be at least current price + increment (or the start price for the first bid).

**Soft close:** if a bid is accepted when 120 seconds or less remain, the lot's end time becomes now + 120 seconds. No cap on extensions.

**Wallet holds:** placing or raising a max bid holds `estimatedTotal(max)` (hammer + buyer premium + lot fee + VAT on fees). Being outbid releases the hold. Winning converts the hold into a debit. A bid is rejected if available balance is too low.

**Fees (defaults):** buyer premium 15% of hammer price; lot fee ₦300 per lot; VAT 7.5% on premium + lot fee. Mark VAT rate as configurable — the business owner will confirm it.

**Who cannot bid:** staff accounts, supplier accounts, suspended users (3 strikes), users without a verified phone.

**Bid engine implementation rules:**
- Accepting a bid is **one Redis Lua script**: validate lot open, validate amount, check hold, apply proxy logic, apply soft close, update state, append to a Redis Stream, publish the price update. No database calls on this path.
- Every bid request carries a client-generated `idempotencyKey`; duplicates return the original result.
- A worker reads the stream and persists bids to PostgreSQL. Persistence must be idempotent.
- Server time is the only clock. Clients receive `serverTime` on connect and compute an offset.
- Lot closing is done by a worker, is idempotent, and freezes the result in PostgreSQL before charging.

Any change to bidding or money code needs: tests covering the change, a concurrency test where relevant, and a clear note in the PR description saying **"MONEY/BID CHANGE — needs human review"**.

## 7. Performance budgets (checked in CI where possible)

- Bid accepted server-side: p95 < 50 ms.
- Price update to other viewers: p95 < 500 ms.
- Web home page LCP on 4G: < 2.5 s. First-load JS: < 200 KB compressed per route.
- Lot list images: thumbnails ≤ 30 KB (WebP/AVIF).
- Mobile cold start on mid-range Android: < 3 s. Use FlashList for long lists.
- No N+1 queries: list endpoints use a fixed number of queries; add indexes with every new query pattern.
- Paginate every list endpoint (cursor-based, max 50 items).

## 8. Nigeria-specific behaviour

- Phone numbers are stored in E.164 (`+234…`). Accept local input like `0803…` and normalise.
- Currency display: `₦12,500` (no decimals unless kobo is non-zero).
- Time zone: store UTC, display Africa/Lagos (WAT, UTC+1).
- Assume weak networks: sockets reconnect silently, requests retry with idempotency keys, the UI shows "reconnecting" instead of stale prices.
- Keep data use low: lazy-load images, no autoplay video, cache aggressively on mobile.
- Test mobile layouts at 360 px wide.

## 9. Security rules

- Validate every input with Zod at the API boundary. Reject unknown fields.
- Auth: phone + OTP, short-lived access token + refresh token (httpOnly cookie on web, SecureStore on mobile).
- Role-based access on every admin endpoint (`admin`, `intake`, `warehouse`, `finance`, `support`).
- Rate-limit login, OTP, bidding, top-up and withdrawal endpoints.
- Every admin action writes to `audit_log` (who, what, before, after).
- Secrets only from environment variables. Update `.env.example` whenever you add one. Never commit `.env`.
- Personal data (BVN, phone, address) is encrypted at rest where stored, and never sent to analytics.

## 10. How to work

1. **Read before writing:** this file, the relevant section of `docs/blueprint.md`, the task in `docs/TASKS.md`, and the existing code you will touch.
2. **One task at a time.** Work only on the task you were given. Note anything else you spot in your summary instead of fixing it.
3. **Plan first** for any task bigger than a small fix: list the files you'll change and the approach, then proceed.
4. **Tests with the code.** Write or update tests in the same change. For bid and money logic, write the tests first.
5. **Small commits** with clear messages (`feat(bids): add soft close to lua script`). One branch and one pull request per task.
6. **Run before you finish:** `pnpm lint && pnpm typecheck && pnpm test` (and `pnpm build` when you changed build config). Do not report done while anything fails.
7. **Database changes** only through new Prisma migrations. Never edit a migration that has been committed.
8. **Record decisions** that future work depends on in `docs/decisions.md` (date, decision, reason).
9. **Ask, don't guess,** when a business rule is unclear, when a change would affect money, or when you need a new dependency. Write the question in your summary and stop.
10. **Never** delete data, rewrite Git history, change CI to skip checks, disable tests, or weaken a security or money rule to make something pass.

## 11. Definition of done

A task is done only when all of these are true:

- [ ] The task's acceptance criteria in `docs/TASKS.md` are met.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass.
- [ ] New behaviour has tests; money/bid behaviour has thorough tests.
- [ ] New endpoints are typed in `packages/api-client` and documented (OpenAPI via NestJS Swagger).
- [ ] New environment variables are in `.env.example` with comments.
- [ ] No performance budget is broken.
- [ ] For UI work: screens follow `docs/DESIGN.md`, pass its anti-"AI-generated" checklist, and screenshots at 360, 768 and 1280 px are attached to the PR.
- [ ] `docs/TASKS.md` status is updated and any decisions are logged.
- [ ] The final summary lists: what changed, how it was tested, anything left open, and questions for the human.

## 12. Code style

- Prettier defaults, 2 spaces, single quotes, trailing commas.
- File names in kebab-case; React components in PascalCase.
- No `any` (use `unknown` and narrow). No non-null assertions (`!`) in money or bid code.
- Prefer small pure functions; keep side effects at the edges.
- Errors: throw typed domain errors (`InsufficientFundsError`, `LotClosedError`), map them to HTTP codes in one place.
- Comments explain *why*, not *what*.

## 13. Design and UX (required for any web, admin or mobile screen)

The product must look professionally designed for Nigerian buyers, not like a generated template. `docs/DESIGN.md` is the source of truth; read it before any UI task. The essentials:

- **Brand:** deep adire indigo (`#1C2A6B`) for brand and actions; danfo yellow (`#FFC629`) **only** for live/closing signals; cool light-grey canvas, white surfaces; green for winning, red for outbid.
- **Type:** Schibsted Grotesk for everything, tabular numbers for prices and timers, sentence case, no all-caps labels.
- **Components:** build only from `packages/ui` tokens and components; no hex values or one-off styles in screens. Flat cards with 1 px borders; shadows only on floating elements; radius hierarchy 4/8/12/16.
- **Icons:** Lucide only. No emoji, stock photos, AI images or illustrations.
- **Motion:** only in response to events (price flash, outbid, win). No scroll animations.
- **UX:** bid in two taps, total cost shown before confirming, never a stale price, every screen has loading, empty, error, offline and success states, 44 px touch targets.
- **Copy:** plain Nigerian English, buttons say what they do ("Place bid ₦12,500"), errors say how to fix the problem, Naira formatting, Nigerian example data.
- **Forbidden:** gradients, glassmorphism, glowing blobs, generic SaaS heroes, fake testimonials or stats, three-icon feature rows, Inter/Roboto as brand font, lorem ipsum. See the full checklist in `docs/DESIGN.md` §8.
- **Self-review:** screenshot every screen at 360, 768 and 1280 px, check it against DESIGN.md, fix issues before reporting done.
