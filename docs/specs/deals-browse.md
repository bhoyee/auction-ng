# Live deals browse

`GET /browse-lots` is public, uncached and documented in OpenAPI. Typed client: `browseDeals` from `@auction-ng/api-client/deals`.

Parameters: `section` (all/top-deals/ending-soon), optional `categoryId`, comma-separated `prices`, `ends`, `conditions`, `limit` 1-50, and cursor. Unknown fields and invalid options are rejected. Option definitions and matching live in `packages/shared/src/deal-filters.ts`. Values are canonicalised before cursor scoping. Price/time ranges are half-open; OR within a group and AND across groups.

The database selects at most 201 active candidate records, with bounded included photos and an indexed condition pattern. A single MGET reads up to 200 Redis lot states, plus Redis TIME for the clock; no per-lot database/snapshot calls. The read model strips leader identities, private maxima and holds. Filtering uses current price (or the starting price only when the authoritative state has no bid) and live extended end times. Top Deals retains staff order and excludes the last twenty minutes; Ending Soon remains within one hour. Terminal/elapsed states never match.

Return the existing public catalogue metadata, next cursor, serverTime and unavailableLiveCount. At most the requested number of results is returned. Cursor progression follows the last scanned candidate so selective pages can be sparse; clients can continue bounded pages. Missing live states are excluded and counted, never replaced with guessed prices; unavailable engine reads fail closed. Client cards retain their normal live subscriptions and recheck selected price/end bands, while visible metadata refreshes every fifteen seconds.

New additive migration/index: `lots_condition_browse_idx (status, condition, end_at, id)`; see the generated database dictionary. No tables or financial records change.

**MONEY/BID CHANGE — needs human review:** the bid-service module gains a read-only batched public-state projection (MGET/TIME). It does not accept bids, initialise missing states, execute Lua, move funds or change fees/settlement. Focused tests verify price-vs-start differences, multi-selection, boundaries, terminal states, extensions, privacy stripping, cursor scope and unavailable states. Concurrency does not introduce a write path.

Owner amendment, 2026-10-29: supported prices are `under-30000`, `under-100000`, `100000-plus` (the first two overlap). End values are `under-1h`, `today`, `tomorrow`; the first includes exactly one hour, while today/tomorrow use Nigerian UTC+1 midnight boundaries. Conditions default to all five if omitted; explicit empty `conditions=` means none and returns no matches. Clients must preserve that empty parameter instead of dropping it. Clear restores all conditions. Existing section scopes remain unchanged. The presentation/read-only rule change does not alter fees, bid acceptance, holds or settlement.
