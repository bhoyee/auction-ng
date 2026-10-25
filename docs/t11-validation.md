# T11 — Realtime gateway validation

**MONEY/BID CHANGE — needs human review.** The gateway reads accepted outcomes and publishes private-safe live updates; it neither moves money nor changes direct/automatic bidding rules. T12 settlement and buyer screens remain separate.

## Files

- `packages/shared/src/realtime.ts` defines strict credentials, session, public state, outbid and internal routing contracts, stream ordering and client timing/watch limits.
- `apps/api/src/auth` adds a typed, rate-limited session check; `apps/api/src/bids` adds the authenticated fresh snapshot. Both are documented in Swagger. Lua stores the accepted stream version and publishes a separate private routing message, preserving the existing public channel, acceptance receipt and T10 stream format.
- `apps/realtime/src/server.ts` implements authenticated rooms, Redis fanout, personalised flags, outbid routing, origin/event/connection/subscription limits, revocation/expiry checks, heartbeat and reconnect readiness. Its existing runtime loader now supports the workspace TypeScript exports.
- `packages/api-client/src/realtime-api.ts`, `realtime.ts`, `realtime-hook.ts` and package exports provide the private API bridge, reconnecting client/store and app-bound React hook. Only approved `socket.io-client@4.8.4` and its required transitive packages are new; other pins and each app's React remain unchanged.
- `apps/realtime/tests`, `apps/api/tests/realtime.test.ts`, `tests/realtime-contracts.test.ts`, the dedicated Vitest config and mandatory runner cover real sockets, Redis, actual buyer sessions and bids, security and both React versions.
- Compose and `.env.example` configure the API address and browser origins. Task/decision records and [the protocol specification](specs/realtime.md) document release boundaries. No database migration or table change is needed; the existing 29-table dictionary remains current.

## Checks

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. The full mandatory suite passes **245 tests**: 204 functional, 25 bid, seven realtime, eight search and one catalogue performance check. Shared money/rule line coverage remains 100%. The final Windows/Docker Desktop run measured 1,000-viewer Redis-to-client p95 **267.52 ms**, including the synthetic state write and publication; this stayed below 500 ms while the local Docker build was active. Durable Lua acceptance p95 was **28.67 ms**, below the unchanged 50 ms budget. Earlier standalone fanout runs were below 80 ms. These are local engine/network measurements, not mobile-carrier latency guarantees.

The dedicated fanout test creates 1,000 actual Socket.IO connections, subscribes them to a real Redis-backed lot, changes its state and publishes through Redis, then measures receipt at all 1,000 clients. Authentication is injected only for benchmark setup; Redis, sockets, subscription handling and per-update revocation checks are real. A separate full API integration test authenticates real synthetic buyers, places funded Lua bids, receives personal updates/outbid alerts, verifies a retry creates no second alert, and logs a buyer out before the next update.

Other tests cover a dropped transport followed by fresh resubscription, rejection of older stream versions, no maximum/identity leakage, unapproved origins, unknown subscription fields, and 51 simultaneous subscriptions being limited to 50 rooms. The shared hook renders with the existing web React 19.2 and mobile React 19.3 without installing another copy.

## PowerShell

Start Docker Desktop using Linux containers. Keep the existing private `.env` and pinned Node 22/pnpm installation described in [README](../README.md).

```powershell
pnpm install --frozen-lockfile
docker compose up -d postgres redis meilisearch
pnpm db:migrate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The full test command runs realtime acceptance as its own mandatory phase after the money/bid tests. It creates isolated synthetic databases and random Redis namespaces, retains fixtures and never contacts live payment providers. It does not reset your application data.

To run the local apps in Docker:

```powershell
docker compose build api
docker compose up -d --no-build --wait web admin api realtime worker
docker compose ps
```

All nine services should become healthy. Buyer web remains <http://localhost:3300>, admin <http://localhost:3301>, API docs <http://localhost:4000/docs>, and realtime health <http://localhost:4001/health>. Live bidding remains disabled, so the placeholder screens do not expose auction controls or live prices yet. Keep `BIDS_ENABLED=false` until human review and settlement are ready.
