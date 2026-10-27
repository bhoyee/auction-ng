# Public marketplace prices

The homepage correction makes current prices visible without signing in. It does not change bid acceptance, funded holds, fees or private spending limits.

- Socket.IO `/public` accepts an empty authentication object and exposes only lot subscribe/unsubscribe and clock synchronisation. It has no bid handlers, account/session identity, user rooms or outbid notifications.
- `GET /lots/:id/public-live-state` returns the existing typed `LiveLot` projection with `isLeader: false`. It validates the lot UUID and rejects unknown query fields. The existing open-lot check excludes draft, scheduled, closed and not-yet-started lots. Responses use `Cache-Control: no-store`.
- The typed API client retrieves snapshots for the gateway. Public sockets receive only explicitly projected current price, end time, lot ID, stream coordinates and server time. Never forward the private Redis event directly.
- Connection attempts are limited per IP in Redis; each socket has request and subscription limits. The existing origin allowlist applies to both namespaces. Public read access does not grant access to authenticated bid, watchlist or account endpoints.
- The shared client uses numeric stream ordering, server clock synchronisation, heartbeat freshness, reconnect and resnapshot behaviour for both namespaces. It clears displayed live state when disconnected. Signing in replaces the public client with the buyer's authenticated client; signing out removes personal state.

Focused checks cover anonymous snapshots, invalid subscription fields, unavailable lots, private namespace rejection, event projection, updates and reconnect. The API/controller remains documented through Swagger. This read boundary is flagged for human review alongside the existing bid-service PR; no money-moving code was changed.
