# Watchlist counters

GET /buyers/watchlist/count requires authenticated buyer access, rejects unknown query fields and returns the strict shared shape { count: non-negative safe integer }. Responses are no-store and include only the current buyer's total saved rows, not the size of the current paginated watchlist page. Existing watchlist PRIMARY KEY(user_id,lot_id) covers the owner filter; no migration or new index is needed. OpenAPI and createWatchStatusClient.count() expose the endpoint.

Header, account dropdown and portal sidebar share one count hook. Successful heart saves/removals already emit owner-tagged watchlist changes; removing from the Watchlist page now emits the same event. Read an authoritative count immediately after each event, coalesce in-flight reads and ignore responses invalidated by newer changes. No optimistic arithmetic, duplicate-event increments or new write endpoint.

Same-user tabs exchange invalidation messages using BroadcastChannel, without lot details, counts or credentials. Each tab fetches with its own authenticated session. If messaging is unavailable, local events/focus/reconnect and the fifteen-second visible-page reconciliation still work. Changes from other devices are discovered by that fallback; this change does not add a Socket.IO watchlist channel. Hidden/offline pages do not poll; focus/visibility/online refresh. Failed reads hide the count, and owner IDs fence old responses during account changes.

Header no longer shows the wallet chip. Balance stays in the account dropdown and portal sidebar. Profile removes the recovery link below the password-change button, keeping the first-password setup path for legacy fixtures/accounts where applicable. Wallet/fee/bid and password-change logic are unchanged.

See ../design/watchlist-counts/README.md for checks and responsive screenshots. No new environment variables or dependencies.
