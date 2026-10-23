# T01 validation

Validation on 23 October 2026. Git was initialized with the supplied documents on `main`; implementation is on `task/t01-monorepo`. No remote was added and no commits were pushed.

## Windows 11

- Node 22.23.4 and pnpm 10.18.3, with isolated linking and hoisting disabled.
- Frozen-lockfile install succeeds.
- Docker Desktop: PostgreSQL 16.13, Redis 7.4.9 and Meilisearch 1.23.0 all pass their Compose health checks.
- `pnpm dev` starts both Next.js apps, the NestJS API, Socket.IO gateway and BullMQ worker. Both HTTP health endpoints respond successfully; worker logs readiness.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Tests cover 10 assertions/cases across health endpoints, OpenAPI, the typed client, realtime and React/token isolation.
- `pnpm test:e2e`: six checks pass, including no horizontal overflow and the expected canvas/font at all required widths.
- `pnpm --filter mobile exec expo install --check`: dependencies are up to date. Mobile uses SDK 58's TypeScript 6.0.3 and React types 19.3.0; the other workspaces use TypeScript 5.9.3.
- `pnpm --filter mobile start` serves the SDK 58 development manifest from the workspace. Expo Go 58.0.5 renders the branded screen in Android 36. Native snapshots at 360/768/1280 px are included alongside the web/admin snapshots in [the screenshot review](design/t01/README.md).
- Android and iOS JavaScript/Hermes bundle exports succeed. No native APK/IPA is built in T01. iOS device testing and real-phone performance measurements are not claimed.
- `pnpm db:migrate` and `pnpm db:seed` explicitly report T02 placeholders and do not change data.

## Linux / CI

The GitHub Actions workflow installs using the frozen lockfile and runs lint, typecheck, tests, builds and Playwright, with a Redis service. A GitHub-hosted run requires publishing the repository later; T01 does not configure a remote or push.

A clean source archive was extracted into an isolated `node:22.23.4-bookworm-slim` container, with no host `node_modules` or build caches. Frozen install, lint, typecheck, all 10 tests and all nine build tasks passed. Redis was accessed over the local Compose network. This validates the main CI commands on Linux; the GitHub-hosted workflow itself is still pending repository publication. Browser checks and native Expo Go were run on Windows.

## Scope

### Local Docker follow-up

The owner requested persistent app containers after localhost:3000 returned an empty response. Windows port inspection identified `EonVPNRoutingService.exe` on 127.0.0.1:3000. Local Compose now includes web, admin, API, realtime and worker alongside the three backing services, using a non-root shared local image, health checks and `unless-stopped` restart policies. Buyer web is published on 3300 and admin on 3301; host ports are configurable in `.env`.

`docker compose up -d --build --wait` starts all eight services healthy. HTTP checks from Windows return 200 for both pages, API/realtime health, search health and API docs. All six browser checks pass against the Docker pages at 3300/3301. Lint, typecheck, all 10 unit/integration tests and build pass. No existing database volume or other application was removed. Native mobile continues to use host Expo Metro and Expo Go.

No business rules, money movement, bidding, schema, seed data, auth, product screens or production deployment were implemented. D01 owns the full design system; T02 owns Prisma and seed data; T17 owns production images and backup/restore.
