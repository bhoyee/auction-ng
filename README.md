# Auction NG

Daily liquidation auctions for Nigerian buyers. T01 provides a runnable development skeleton only: no auctions, accounts, payments or database schema exist yet.

## Run all server services in Docker (recommended)

Start Docker Desktop using Linux containers. In PowerShell:

```powershell
Set-Location 'C:\Users\bhoyee-pc\Desktop\auction-ng'
docker compose up -d --build --wait
docker compose ps
```

Keep an existing `.env`. On a fresh copy, you can first run `Copy-Item .env.example .env`. The first build downloads dependencies and compiles the apps; subsequent starts reuse the local image. All eight services should show `healthy`, including the BullMQ worker. Docker Desktop keeps them running after you close PowerShell and restarts them when Docker starts again.

| Address                      | What you should see         |
| ---------------------------- | --------------------------- |
| http://localhost:3300        | Buyer placeholder           |
| http://localhost:3301        | Staff placeholder           |
| http://localhost:4000/health | API: `{"status":"ok"}`      |
| http://localhost:4001/health | Realtime: `{"status":"ok"}` |
| http://localhost:4000/docs   | API documentation           |
| http://localhost:7700/health | Search health               |

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
   docker compose up -d --wait postgres redis meilisearch
   docker compose ps
   ```

   The first run downloads three images. Expect `postgres`, `redis` and `meilisearch` to show `healthy`. Keep Docker Desktop running. These services listen only on your computer, and their data persists in Docker volumes.

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

These two commands are intentionally explicit placeholders until T02:

```powershell
pnpm.cmd db:migrate
pnpm.cmd db:seed
```

They print a notice and make no database changes. There are no demo buyers or lots yet.

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
