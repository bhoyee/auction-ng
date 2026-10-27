# Auction NG

For the populated T13b buyer redesign, follow the [photographic marketplace demo guide](docs/specs/marketplace-demo.md). It creates isolated sample data and serves the website on port **3300**, with email codes in the local Mailpit inbox.

For real verification and receipt emails, follow the [SMTP setup guide](docs/specs/smtp-email.md). Local Mailpit capture remains the default until you configure a credential and enable SMTP mode.

Daily liquidation auctions for Nigerian buyers. The T13 buyer website connects the catalogue, email sign-in, live bidding, wallet, invoices and private pickup passes to the existing APIs. See the [buyer preview guide](docs/specs/web-buyer.md) for PowerShell steps and the remaining test-provider setup. Native buyer screens remain T14.

## Run all server services in Docker (recommended)

Start Docker Desktop using Linux containers. In PowerShell:

```powershell
Set-Location 'C:\Users\bhoyee-pc\Desktop\auction-ng'
docker compose up -d --build --wait
docker compose ps
```

Keep an existing `.env`. On a fresh copy, you can first run `Copy-Item .env.example .env`. The first build downloads dependencies and compiles the apps; subsequent starts reuse the local image. All nine services should show `healthy`, including the BullMQ worker and local Mailpit inbox. Docker Desktop keeps them running after you close PowerShell and restarts them when Docker starts again.

| Address                      | What you should see         |
| ---------------------------- | --------------------------- |
| http://localhost:3300        | Buyer auctions and sign-in  |
| http://localhost:3301        | Staff placeholder           |
| http://localhost:4000/health | API: `{"status":"ok"}`      |
| http://localhost:4001/health | Realtime: `{"status":"ok"}` |
| http://localhost:4000/docs   | API documentation           |
| http://localhost:7700/health | Search health               |
| http://localhost:8025        | Local test email inbox      |

Port 3000 is occupied by a local VPN routing service on this machine. Docker publishes buyer web on **3300** and admin on **3301** while retaining their standard internal ports. Set `WEB_HOST_PORT`, `ADMIN_HOST_PORT`, `API_HOST_PORT` or `REALTIME_HOST_PORT` in `.env` if another application occupies one of the published ports. All published services are restricted to this computer.

To see logs or stop Auction NG without removing its data:

```powershell
docker compose logs --tail 50 web admin api realtime worker
docker compose stop
```

After editing source, run `docker compose up -d --build --wait` again. This Docker mode serves built apps and does not watch files. Do not also run `pnpm dev` while the Docker API and gateway occupy ports 4000/4001. The mobile app runs on your phone through Expo Go; follow step 6 below to start its host-side Metro server.

## Start on Windows 11 with host development tools

Use this alternative when editing code with live reload and when ports 3000/3001/4000/4001 are available. Use the Docker instructions above on this machine while the VPN occupies port 3000.

Use a normal PowerShell window. Commands below do not require Bash or Windows Subsystem for Linux terminals.

1. Install [Git for Windows](https://git-scm.com/download/win), [Node.js 22.23.4](https://nodejs.org/dist/v22.23.4/) (choose the Windows x64 `.msi` installer), and [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/). Docker Desktop may ask you to enable WSL 2 and restart Windows. Start Docker Desktop and wait until it says the engine is running. Use Linux containers.

2. Close and reopen PowerShell after installation. Install the pinned package manager:

   ```powershell
   npm.cmd install --global pnpm@10.18.3
   node --version
   pnpm.cmd --version
   docker version
   ```

   Expect Node `v22.23.4`, pnpm `10.18.3`, and both Docker Client and Server details. The `.cmd` spelling avoids PowerShell's script execution-policy errors; it runs the same package manager as `pnpm`.

3. Open the project folder and install its dependencies:

   ```powershell
   Set-Location 'C:\Users\bhoyee-pc\Desktop\auction-ng'
   pnpm.cmd install --frozen-lockfile
   Copy-Item .env.example .env
   ```

   Copy `.env.example` only on your first setup. Keep an existing `.env` if you have changed its settings. This file contains local development settings and must never be committed.

4. Start the local database, cache and search services:

   ```powershell
   docker compose up -d --wait postgres redis meilisearch mailpit
   docker compose ps
   ```

   The first run downloads four images. Expect `postgres`, `redis`, `meilisearch` and `mailpit` to show `healthy`. Keep Docker Desktop running. These services listen only on your computer. Database/cache/search data persists in Docker volumes; the development inbox is temporary.

5. Start the five desktop/server apps:

   ```powershell
   pnpm.cmd dev
   ```

   Leave this window open. Expect web and admin readiness messages, `Realtime gateway ready`, and `Worker ready`. Open these addresses in your browser:

   | Address                      | What you should see                                   |
   | ---------------------------- | ----------------------------------------------------- |
   | http://localhost:3000        | Auction NG wordmark and “Auctions are on the way”     |
   | http://localhost:3001        | Auction NG wordmark and “Staff workspace”             |
   | http://localhost:4000/health | `{"status":"ok"}`                                     |
   | http://localhost:4001/health | `{"status":"ok"}`                                     |
   | http://localhost:4000/docs   | Interactive API documentation for the health endpoint |
   | http://localhost:7700/health | Meilisearch health response                           |

6. Open the mobile app on your Android phone:

   - Connect the phone and computer to the same Wi-Fi network. Avoid guest networks that isolate devices.
   - Install Expo Go matching **SDK 58**. Check [Expo's official download page](https://expo.dev/go) and choose SDK 58 and Android. If the Play Store version has not received SDK 58 yet, use the official Android download offered there. If no SDK 58 Android build is available yet, phone testing must wait for that release or use a development build; an older Expo Go cannot open this project.
   - Open a **second** PowerShell window and run:

     ```powershell
     Set-Location 'C:\Users\bhoyee-pc\Desktop\auction-ng'
     pnpm.cmd --filter mobile start
     ```

   - Allow Node.js through Windows Firewall on your **private** home/work network if prompted.
   - In Expo Go, choose **Scan QR code** and scan the code printed in PowerShell. If scanning is unavailable, use the `exp://` address printed by Expo.
   - Expect “Auction NG” and “Auctions are on the way” in Schibsted Grotesk on a light grey screen. Leave the second PowerShell window open while using the app.
   - If it cannot connect, check that VPNs are off, both devices share the same network, and the firewall allows Node on that private network. Do not disable your firewall.

7. Stop development with **Ctrl+C** in each PowerShell window. To stop Docker services while keeping their data:

   ```powershell
   docker compose stop
   ```

## Run checks

To check email login without any login screens, start the Docker services, configure encryption keys and apply migrations using the database commands below. Then run:

```powershell
pnpm.cmd auth:smoke
```

Expect `Local email capture, sign-in, empty wallet, history, refresh and logout passed. Phone remains unverified.` Open http://localhost:8025 to see the captured test email. This creates one synthetic buyer with an empty wallet, checks its balance/history and signs it out; it never creates wallet funds. Messages stay in the local development inbox and are not delivered to real email accounts. No codes or session tokens are printed in command output.

For a manual test, open http://localhost:4000/docs and use `POST /auth/request-code` with a synthetic email, a UUID `deviceId` and `client: mobile`. Read the code in the local inbox, then use `POST /auth/verify-code` with that code, the returned challenge ID and the same device ID/client. The response contains credentials for your local test account; keep them private. [Authentication contracts and limits](docs/specs/authentication.md) explain browser cookies and native token storage. Mobile/web login screens are not part of T04.

For host-side `pnpm.cmd dev` with an older `.env`, add `AUTH_MODE=local`, `MAILPIT_URL=http://localhost:8025` and `AUTH_WEB_ORIGINS=http://localhost:3000,http://localhost:3001` to that ignored file, keeping its existing keys. Docker sets local inbox configuration automatically. Never enable local mode on a public deployment.

Keep Docker services running. In another PowerShell window, from the project folder:

```powershell
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd build
pnpm.cmd exec playwright install chromium
pnpm.cmd test:e2e
```

Each command should finish successfully. The tests exercise API health, OpenAPI, Redis-backed realtime health, the Socket.IO handshake, client error handling, shared colours and separate React resolutions. Browser tests check web/admin at 360, 768 and 1280 px and save screenshots under `test-results/`.

`build` produces Next.js production output, compiled backend apps and **Android/iOS JavaScript bundles**. It does not create installable APK/IPA files; native release builds belong to later mobile work. Native screenshot and Expo Go checks require a phone or emulator.

The database commands now apply the real Prisma migration and load repeatable demo data:

```powershell
pnpm.cmd db:keys
pnpm.cmd db:migrate
pnpm.cmd db:seed
pnpm.cmd db:docs
```

Run them from the repository root with PostgreSQL running. `db:keys` fills missing encryption/lookup keys in your ignored `.env` without printing or replacing existing keys. Keep these keys: existing encrypted data depends on them. Migrations only apply new migration files; they never reset the database. The seed inserts 1 demo Lagos hub, 12 categories, 200 draft lots, 20 buyers and 3 staff, preserves edits on retries, and leaves wallets empty. All data is synthetic, the pickup address is explicitly non-operational, and images are local “Photo pending” placeholders.

The complete [database dictionary](docs/specs/database-schema.md) lists every table, column/type, relation, CHECK, unique constraint and index. `db:docs` regenerates it from the migrated PostgreSQL catalog.

For Docker-only database commands, first configure keys with `pnpm.cmd db:keys` and rebuild/start the image so Compose loads them:

```powershell
docker compose up -d --build --wait
docker compose exec -T api pnpm db:migrate
docker compose exec -T -e NODE_ENV=development api pnpm db:seed
```

Demo seeding refuses `NODE_ENV=production`; the explicit development override above is for the local Docker stack only. Docker uses PostgreSQL's internal service hostname instead of host localhost. No migrations or seeds run during image builds or automatically on application startup.

`pnpm test` creates three new `auction_ng_test_*` databases, applies migrations there, and checks the schema, idempotent/concurrent seed, encryption, relations, ledger constraints and authentication. Separate auth and ledger data keeps seed-count assertions independent of signup and money tests. It does not reset or seed your application database. Test databases are deliberately retained rather than deleted. The local PostgreSQL account must have CREATE DATABASE permission; use `TEST_DATABASE_ADMIN_URL` for a separate test-capable account if needed. CI uses an ephemeral PostgreSQL service and independent random encryption keys.

## Linux and CI

Install Node from `.nvmrc`, pnpm 10.18.3 and Docker with the Compose plugin. From the repository root:

```sh
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d --wait postgres redis meilisearch
pnpm dev
```

In another terminal, use `pnpm --filter mobile start` for Expo. All package scripts are cross-platform; no shell-specific environment assignments or filesystem commands are used in them. GitHub Actions runs install, lint, typecheck, tests, build and browser smoke tests on Linux. The repository is [bhoyee/auction-ng](https://github.com/bhoyee/auction-ng). Changes are published to `dev` and merged into `main` through a pull request after checks pass.

## Workspace

- `apps/web`, `apps/admin`: Next.js + Tailwind, ports 3000/3001, React 19.2.0.
- `apps/api`: NestJS, port 4000; health is process liveness, not database readiness.
- `apps/realtime`: Socket.IO + Redis adapter, port 4001; health requires both Redis clients ready. No bid events or rooms are implemented yet.
- `apps/worker`: BullMQ boot on a dedicated skeleton queue, no HTTP server or business jobs.
- `apps/mobile`: Expo 58.0.17, React 19.3.0, React Native 0.88.0; Expo Router discovers the monorepo automatically.
- `packages/shared`: strict health schema; money and bidding rules wait for T03.
- `packages/api-client`: typed, validated health client.
- `packages/ui`: design tokens and licensed font only; component library waits for D01.
- `packages/config`: strict TypeScript, ESLint and Tailwind theme wiring.
- `infra/docker/local.Dockerfile`: shared local app image; production deployment and backups remain T17.

pnpm uses isolated linking with hoisting disabled. React is an app dependency, never a root or shared UI dependency. A test verifies each app's actual resolved version. After editing `packages/ui/tokens.ts`, run `pnpm tokens:generate` to regenerate the web theme.

The decision log records the approved T01 placeholder exception and SDK choice. Production hosting, backups and deployment are T17, not part of the local skeleton.

Wallet operation contracts and limits are documented in [the wallet ledger specification](docs/specs/wallet-ledger.md). Bank-transfer funding remains T06; there are no public money mutation endpoints.

T06 adds test-only Paystack funding with buyer-paid fees, upfront quotes and gross/fee/net receipts. For a NGN 10,000 DVA transfer, the documented NGN 100 Paystack fee leaves NGN 9,900 wallet credit. [Setup and outstanding sandbox acceptance](docs/t06-validation.md); [payment contracts](docs/specs/paystack-topup.md). Fee disclosure screens remain in the buyer-app tasks.

Owner-approved T06 follow-up: wallet funding also supports hosted card checkout, with separate upfront local/international fee quotes. For a NGN 10,000 local-card charge the NGN 250 fee leaves NGN 9,750 wallet credit. Bids remain fully funded; outbid holds return to available wallet balance. Separate refund requests record review tickets without automatic bank/card payouts. Card details stay on Paystack. Product payment screens remain in the buyer-app tasks.

T07 adds public catalogue APIs and protected draft-intake/image contracts. Open `http://localhost:4000/docs` after starting Docker. Seeded lots stay private drafts, so an empty public catalogue is expected. [Local setup and outstanding acceptance](docs/t07-validation.md); [catalogue and R2 contracts](docs/specs/catalogue.md). Product screens and staff SSO/MFA are still pending.

T08 adds `GET /search?q=iphnoe` with typo tolerance, catalogue filters and closing-time cursors. Run `pnpm search:configure` before restarting Docker to generate the private API/worker credential. The worker keeps open-lot search in sync through a durable outbox; PostgreSQL rechecks every returned match. [PowerShell setup](docs/t08-validation.md); [search contracts](docs/specs/search.md). Draft-only demo stock is excluded from search.

T09 adds funded bid preparation, Redis-only confirmation and idempotent cancellation/outbid release for the shared web/mobile API. It reserves wallet funds before accepting a bid and keeps accepted leading funds held. Run `pnpm bids:configure` to generate the private cleanup credential; keep `BIDS_ENABLED=false` pending money/bid review and later persistence/settlement. [Step-by-step PowerShell instructions and validation](docs/t09-validation.md); [bid contracts and recovery boundary](docs/specs/bidding.md). No bidding screen is included yet.
