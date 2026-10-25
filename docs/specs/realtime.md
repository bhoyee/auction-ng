# Realtime gateway (T11)

**MONEY/BID CHANGE — needs human review.** This adds routing metadata to accepted bid publication, not new bidding or money rules. Ledger reservations, proxy/direct outcomes, retry receipts, soft close and T10 persistence remain unchanged. No buyer screens, charging or push notifications are included.

## Protocol and privacy

The Socket.IO gateway uses the existing Redis adapter and authenticates each connection through the API. Handshake `auth` must contain only `accessToken` and installation UUID `deviceId`. Tokens are not placed in URLs or logged. The API checks the actual buyer session; the client cannot select a user room or supply a user ID.

| Direction        | Event                  | Contract                                                                                             |
| ---------------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| Client → gateway | `lot:subscribe`        | Strict `{ lotId }`; acknowledgement is `{ ok: true, lot }` or `{ ok: false, code }`                  |
| Client → gateway | `lot:unsubscribe`      | Strict `{ lotId }`                                                                                   |
| Client → gateway | `clock:sync`           | Empty object; acknowledgement contains ISO `serverTime`                                              |
| Gateway → client | `lot:update`           | `lotId`, current integer-kobo price, `endsAt`, `streamId`, `serverTime`, personal boolean `isLeader` |
| Gateway → client | `user:outbid`          | Lot, price, end time, stream version and server time; no bidder identities or maxima                 |
| Gateway → client | `serverTime`           | ISO server time on connect and every five seconds                                                    |
| Gateway → client | `realtime:unavailable` | Empty object; invalidate cached live prices and reconnect                                            |
| Gateway → client | `session:expired`      | Empty object; clear live state and require refreshed credentials                                     |

Only the gateway joins `user:<authenticated-user-UUID>` rooms. Lot rooms are server-derived `lot:<validated-UUID>`. Public snapshots/events never contain access tokens, session IDs, bidder identities or another buyer's maximum. Personal leader flags and outbid events are projected separately for each authenticated local socket. Each gateway instance subscribes to the private routing channel and sends only to its own local connections, avoiding duplicate cross-instance fanout while retaining the Redis adapter for room infrastructure.

The Lua script stores the accepted stream ID on the live lot and publishes a second, Redis-internal `personal-updates` message containing current/previous leader and requester UUIDs. This channel contains no maximum amounts. The original `updates` channel remains unchanged. Accepted result and stream-event shapes stay compatible with T10. An exact bid retry returns before publication, so it does not create another alert.

## Fresh snapshots and sessions

Two typed API operations are documented in Nest Swagger:

- `POST /auth/realtime-session`: authenticated bearer token and `X-Device-Id`, empty body/query; returns the caller's user/session UUID and access/session expiry. It is bounded to 600 checks per buyer per existing 15-minute auth-rate window.
- `POST /lots/:id/live-state`: authenticated buyer and installation, empty body/query; returns a strict fresh snapshot and personal leader flag. It checks the open lot and the bid engine's existing runtime readiness. Redis supplies the snapshot server time. Bidding paused for recovery means live state is unavailable, not reconstructed from stale PostgreSQL prices.

The Node-only client export `@auction-ng/api-client/realtime-api` forwards credentials to the configured private API host. Redirects and non-local/non-Compose API addresses are rejected. It distinguishes revoked/expired sessions from temporary network/service failures so an outage does not force a buyer to sign in again.

The gateway joins a lot room before fetching its API snapshot. Updates received during that read carry their Redis Stream version; the shared client ignores older snapshots/events using numeric milliseconds/sequence comparison. This closes the subscribe/read race and avoids lexicographic ordering errors such as sequence 10 sorting before 2.

Before delivering a price or personal alert, the gateway checks session expiry and reads all relevant revocation fences in one bounded Redis call. A logout, refresh or eligibility fence therefore blocks later updates for that session. Session leases are rechecked through the API every 30 seconds; heartbeat checks also remove expired/fenced sessions. Frames already sent before revocation are not recalled; the app must close its client when signing out.

## Weak networks and lifecycle

`createRealtimeClient()` reconnects with jitter, resubscribes to watched lots and fetches their latest snapshots. Disconnects and service failures clear live prices. A 12-second heartbeat watchdog also invalidates a half-open connection. Snapshot failures retry after five seconds rather than leaving a stale price or silently treating the old state as live. Old connection/watch acknowledgements cannot revive disposed state. Reference-counted watches and idempotent cleanup support multiple components and React effect remounts.

`connect()` keeps the personal channel active even with no watched lots; `watchLot()` also starts a connection when needed. Call `reauthenticate()` after access-token rotation so the next handshake uses the current credential getter. Expired/revoked sessions stop retrying until refreshed credentials are supplied. `close()` cancels timers, removes watches and closes the connection.

Server time is measured with a round-trip midpoint offset; browser/device time never controls bid acceptance or closing. Real bids continue using the existing HTTPS preparation/confirmation path, client-generated retry keys and Redis server clock. This gateway does not accept bid mutations over sockets.

Redis failures mark health unavailable and disconnect sockets. The gateway reports readiness again only after its price subscription is established. Clients then fetch fresh snapshots. Redis process restart/recovery still follows T09's reviewed runtime-identity boundary; T11 never resets that identity or releases funds.

## Limits and configuration

- Maximum 50 watched lots per socket/client, reserved before asynchronous snapshot reads so simultaneous requests cannot bypass it.
- Up to 2,000 connection attempts per IP and 20 per buyer per minute; 240 client events per socket per minute. IP rate keys use a hash and expire. The IP allowance accommodates shared Nigerian mobile-network addresses.
- Maximum Socket.IO message size 4,096 bytes; strict Zod input validation rejects unknown subscription fields.
- `REALTIME_WEB_ORIGINS` explicitly allows browser origins; unapproved origins are rejected at the Engine.IO handshake, including WebSockets. Native clients may omit Origin but must authenticate.
- `INTERNAL_API_URL` points to localhost for host development and `http://api:4000` inside Compose. Public production connections must use the HTTPS endpoint behind the existing proxy.

Real-time alerts are live delivery, not a durable notification inbox. Disconnected clients recover the current price and leader status from snapshots; durable push/history belongs to later notification work. Keep `BIDS_ENABLED=false` until settlement and human review are ready.

## Shared React hook

The owner approved `socket.io-client@4.8.4`. No additional React copy or peer dependency is installed in the shared client. Bind the hook once using the app's own React hooks:

```typescript
import { useEffect, useSyncExternalStore } from 'react';
import { createUseLiveLot } from '@auction-ng/api-client/realtime-hook';

export const useLiveLot = createUseLiveLot({ useEffect, useSyncExternalStore });
```

Use it in a client component with an app-owned `RealtimeClient` instance and a lot UUID. Render bids only when `status === 'live'`; other states must show reconnecting, unavailable or sign-in guidance. A later Next.js component must have its client boundary. Mobile lifecycle/network transitions should reuse `reauthenticate()`/connection ownership at the app boundary. Screens remain in the later design/frontend tasks.

A live connection does not mean a lot remains open: the screen must also disable bidding at its server-adjusted end time. On mobile foreground/network changes, the app provider must request a fresh connection/snapshot rather than reuse a backgrounded screen's price. Close the client on sign-out and create/rebind it for the next signed-in buyer.
