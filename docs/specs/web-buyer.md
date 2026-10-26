# T13 buyer web app

Implemented on `task/t13-web-buyer`. Validation evidence and outstanding provider setup are recorded below.

## Local preview in PowerShell

1. Open Docker Desktop and wait for its engine to start.
2. Open PowerShell in the `auction-ng` folder. Use the repository's pinned Node 22.23.4 and pnpm 10.18.3, or install those exact versions if this is a new computer.
3. Run `pnpm install --frozen-lockfile`.
4. Keep your existing private `.env`. On a new checkout only, copy `.env.example` to `.env`, then follow the existing database key setup in the root README. Never replace a working `.env` or commit it.
5. Run `docker compose up -d postgres redis meilisearch mailpit`.
6. Run `pnpm db:migrate`. This applies additive migrations; it does not reset your database.
7. Run `docker compose up -d --build web admin api realtime worker` to build and start the local applications.
8. Open **http://localhost:3300** for buyers and **http://localhost:3301** for staff. Ports 3000 and 3001 are left available for your other software.
9. Choose **Sign in**, enter an email and choose **Email me a code**. In local mode, open **http://localhost:8025** to read the message in Mailpit. Copy its six-digit code back into the buyer page. Mailpit is a local inbox; it does not deliver to a real external inbox.
10. Open **Wallet** to see available funds, reservations and funding history. Use **Show fee and wallet credit** before paying. The processing fee is buyer-paid; only the displayed net amount reaches the wallet.

Published lots appear on the home page. Draft seed lots are deliberately absent from the public catalogue. An empty catalogue is an honest empty state, not a reason to publish draft stock or invent prices.

Real card/transfer testing still needs T06's Paystack test credentials and reachable sandbox webhook. Real images need T07's R2 setup. An email login does not verify a phone; bidding remains blocked until the existing verified-phone requirement is met. The browser tests simulate eligibility only inside their new isolated database, with no public bypass endpoint. No live payment endpoint is used.

Public API/socket URLs are Docker build arguments, so changing them requires rebuilding the image. The server-side catalogue URL is a runtime setting. Browser tests reserve port 3310 and refuse to reuse an existing preview with a different API configuration; stop your own preview with Ctrl+C before running them.

## Routes and privacy

Public routes: `/`, `/categories`, `/categories/:id`, `/ending-soon`, `/search?q=…`, `/lots/:id`, `/locations`, `/help`, `/sign-in`.

Private views: `/account`, `/watchlist`, `/my-bids`, `/wallet`, `/invoices`, `/invoices/:id`, `/invoices/:id/pickup-pass`. Access tokens stay in memory; refresh tokens stay in the existing HttpOnly cookie. The non-secret installation UUID is the only localStorage entry. The pending card payment UUID is kept in sessionStorage solely to request server verification; it is never proof of payment.

Private pickup QR images are generated locally from the authenticated pass response. They are not sent to an external QR service, placed in a public image URL or included in a query string. Keep actual pickup passes private.

Public metadata is cached for 30 seconds. Starting prices are labelled as starting bids. Current prices and leadership come from authenticated socket snapshots; a disconnect or browser offline event clears the live display and disables bidding. Direct bids are the default; automatic limits require an explicit selection.

## Buyer API additions

All endpoints use the authenticated buyer's identity, strict shared Zod contracts and `Cache-Control: no-store`. Lists have cursor pagination, at most 50 rows and fixed query counts. Existing owner/time indexes cover these queries; no schema migration is required.

- `GET /buyers/watchlist`: your saved public lots.
- `POST /buyers/watchlist/status`: saved state for at most 50 displayed lot IDs in one query.
- `POST /buyers/watchlist/:id`: idempotently set `{ watching: true | false }`.
- `GET /buyers/bids`: your persisted bid history; historical amounts are not live prices.
- `GET /buyers/lots/:id/bid-history`: authenticated recorded public prices and lot-scoped anonymous labels, without request amounts, user identifiers or private limits.
- `GET /buyers/invoices`: your invoices, newest first.
- `GET /buyers/invoices/:id`: your invoice, fee breakdown and pickup location, without pickup secrets.

The existing `POST /invoices/:id/pickup-pass` separately authorizes access to a paid pass. New contracts are exported through `packages/shared` and `createBuyerClient`; Swagger is available at the local API's `/docs`.

`GET /payments/banks` supplies up to 50 Nigerian verification banks per cursor page for the account-setup picker. It uses the existing test-key-only Paystack adapter and makes no payment or ledger changes. Bank codes stay behind the picker; buyers select a bank name. The upstream contract follows [Paystack's List Banks API](https://paystack.com/docs/api/miscellaneous/). An unavailable bank list remains an explicit error, not an invented fallback list.

## Validation

Verified locally on 2026-10-26 with Node 22.23.4 and pnpm 10.18.3:

- Frozen-lockfile install, `pnpm lint` and `pnpm typecheck` pass.
- `pnpm test`: 313 tests pass, including buyer ownership/privacy, bank metadata, immutable bid retries and the existing money/concurrency suites. Durable bid acceptance p95 is 11.44 ms; Redis-to-socket p95 for 1,000 viewers is 70.40 ms; 1,000 mixed lot closes take 55.656 seconds. Catalogue reads use four SQL queries for either one or 50 lots, with 24.4 ms HTTP p95 for 50 lots.
- The production buyer journey passes sign-up, synthetic test-mode funding, bid, outbid, win, invoice and private pickup pass. Default Lighthouse mobile simulated LCP is 2,485.102 ms; all 23 measured routes/states are below 200,000 compressed JavaScript bytes, with 197,198 bytes the largest. See [performance evidence](../design/t13/performance.json).
- All 69 responsive captures at 360/768/1280 px were visually reviewed against DESIGN.md. These use synthetic data and an honest photo-pending state. Real R2 images and physical mobile-network acceptance remain outside this evidence.

`pnpm build` passes all nine package builds, including Android and iOS exports. `pnpm test:e2e` passes all 19 browser tests, including the complete buyer journey. The new Docker image also passes all eight non-mobile builds; local container rollout is recorded separately after the image is packaged.

For the production mobile audit in PowerShell, stop any preview using port 3310, then run:

```powershell
$env:NEXT_PUBLIC_API_URL = 'http://localhost:4400'
$env:NEXT_PUBLIC_REALTIME_URL = 'http://localhost:4401'
$env:API_INTERNAL_URL = 'http://localhost:4400'
pnpm --filter web build
$env:WEB_PERFORMANCE_CHECK = 'true'
pnpm exec playwright test tests/e2e/buyer-journey.spec.ts --workers=1
Remove-Item Env:WEB_PERFORMANCE_CHECK
Remove-Item Env:NEXT_PUBLIC_API_URL
Remove-Item Env:NEXT_PUBLIC_REALTIME_URL
Remove-Item Env:API_INTERNAL_URL
```

This builds the browser against isolated test ports, starts a production server on 3310, and checks the unchanged 2,500 ms mobile LCP and 200,000 compressed JavaScript byte limits. Stop your own development previews before measuring, including Expo. Browser cache is disabled. Because emulated time and cached responses can invalidate browser timing sizes, the check collects loaded script URLs and document references, then measures their actual local HTTP bodies with gzip requested. It also counts gzip-compressed inline scripts. Tiny responses that Next serves uncompressed count at their full size. Full document loads reset the count; SPA transitions retain already-loaded scripts, conservatively counting the session's scripts. Reports and responsive screenshots are written under `test-results/production`. Do not use these test-port build variables for the Docker preview.

## Implementation map

- `apps/web/app/page.tsx` and `[...path]/page.tsx`: cached public catalogue routes; separate sign-in, search, lot, account, wallet, watchlist, bid and invoice route files keep unrelated screens out of each initial bundle. Root error, loading and not-found pages use shared states.
- `apps/web/components`: navigation, catalogue cards, lot detail and confirmation, recorded prices, own bid positions, email sign-in, account, wallet, bank picker, invoices and local pickup QR rendering.
- `apps/web/lib`: in-memory session rotation, network state, server catalogue reads and immutable bid preparation/retry operations. A delayed profile save updates only the matching user's profile and preserves a newly rotated access token.
- `packages/ui/web`: reusable buyer layouts, honest photo-pending/retry states, consent control and mobile bid bar. The theme generator exposes the existing form-width token.
- `apps/api/src/buyers`, shared buyer schemas and typed API client: owner-scoped reads and watchlist writes, with accepted public-price history and anonymous lot-scoped aliases. The payment adapter supplies verification-bank metadata.
- `tests/e2e/buyer-journey.spec.ts`, `web-budgets.ts`, the IPC fixture and bootstrap script: isolated end-to-end funding/bidding/settlement, responsive capture and production performance checks. `tests/web-bid-operation.test.ts` covers immutable retry/cancellation and changed-fee handling.
- `.env.example`, Compose, the local Dockerfile and Turborepo configuration: separate public browser build URLs from the internal Docker catalogue URL; no credentials become browser variables.

The [screenshot index](../design/t13/README.md) links all 23 views/states at three widths.

The browser journey creates a new retained test database and a unique Redis namespace. The test provider supplies synthetic hosted-card outcomes; funding and settlement still run through the real payment, ledger, bid and closing services. Test-only coordination uses Node IPC, not an HTTP backdoor. Existing Docker users, wallets, lots and the main bidding namespace are left untouched.

**MONEY/BID CHANGE — needs human review**: the UI submits existing money and bid contracts. Retry keys and immutable amounts are preserved; changed server fees stop confirmation. Automated checks do not replace human money/bid review or the outstanding provider acceptance.
