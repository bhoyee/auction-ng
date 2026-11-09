# T09 bid funding contract — owner approved

The owner approved this flow on 2026-10-25 with “so you can implement the standard approach then”, following the explanation of the reservation pattern, the configurable timeout and the PostgreSQL/Redis tradeoff. Existing ledger rules, fees, authentication requirements and recorded funding decisions remain binding. Human review remains required before merge or enabling bidding.

## Problem

The ledger derives wallet balances and commits reservations in PostgreSQL. The bid acceptance path must run entirely in Redis. Copying an available balance into Redis would let it disagree with the ledger during simultaneous bids, withdrawals, failures or retries. Two independent writable balances are not safe.

## Recommended contract

1. Add a separate, authenticated bid-preparation endpoint. It checks buyer ownership, verified phone, account eligibility and the requested lot/max/fee configuration. The ledger reserves the full estimated total before the API issues a single-use Redis proof. An empty or underfunded wallet cannot obtain that proof. The final bid endpoint performs no database calls, including authentication lookups; its proof is bound to the verified session and installation.
2. Preparation lasts **60 seconds** by default, configurable in shared rules. It is a reservation, not an accepted bid. The future review/confirmation UI must disclose the reservation and expiry; failed, canceled or abandoned preparations cannot leave permanent holds.
3. The Redis Lua script consumes only an exact, unexpired proof bound to that user, session, installation, lot, maximum, fee version and idempotency key. It applies proxy bidding, equal-max priority and soft close; appends an accepted event and publishes only the public update. An exact retry returns its original result. Unknown/revoked proofs and uncertain state reject the bid.
4. A leading buyer raising their maximum reserves **only the additional required amount**. The already committed reservation stays protected. Separate additive reservations avoid reducing or replacing an existing hold, consistent with T05. The ledger owns any atomic grouping/release/capture work; later settlement must capture the actual invoice total and release unused funds without exceeding the combined reservations.
5. A losing/outbid/canceled preparation releases funds through the ledger, with idempotency and wallet row locks. Redis must first confirm that its proof cannot be consumed. Funds become available for spending only after the ledger release commits. Outbid releases return to the wallet; no automatic external card/bank refund is introduced.
6. An accepted winning reservation never expires just because its preparation window elapsed. Retrying an accepted request cannot release it. Cancel/expiry racing against acceptance must settle to exactly one terminal outcome.
7. Redis disconnection, uncertain responses, restart/recovery or unconfirmed durability pauses acceptance/release as needed. Do not advertise an accepted bid until its durable outcome is established. Rebuild/verify state against durable intents before resuming after state loss; never guess that an uncertain reservation is safe to release. Session revocation and account suspension must invalidate proofs, with fail-closed recovery.

This separates slower ledger preparation from the required Redis-only acceptance path. The existing 50 ms acceptance target applies to the latter; preparation latency must be measured and reported separately. Public wallet balances stay ledger-derived throughout. No unsecured bids, negative balances, live payment calls, fee changes or phone-verification exceptions are proposed.

## Implementation scope

- `packages/shared`: strict preparation/acceptance/result contracts, configurable preparation lifetime and bid eligibility/limit rules.
- `apps/api/src/ledger`: durable preparation reservations and ledger-owned idempotent release integration; additive migrations and an updated full database dictionary.
- `apps/api/src/bids`: Redis proof/state boundary, a generated Lua implementation tied to shared rules, typed authenticated preparation and Redis-only acceptance endpoints, Swagger and rate limits.
- Existing API authentication/logout/account-state boundaries: proof revocation and fail-closed recovery integration.
- Existing worker infrastructure: preparation expiry/outbid release processing; only the ledger module writes postings. Bid-row stream persistence remains T10 and final invoicing/settlement remains T12.
- `packages/api-client`: typed clients for web/mobile; no product screen before D01.
- Tests first: money conservation, simultaneous cross-lot preparation, duplicate requests, delta raises, cancel/accept races, outbid releases, revocation, expiry, uncertain responses and recovery. Also the required 10,000 shared/Lua comparisons, 500 concurrent bidders and unchanged acceptance latency budget.

Reuse the already pinned **`redis@5.8.3`** client in `apps/api` (already a direct dependency of `apps/realtime`). The owner approved this direct use as part of the proposal; no new Redis library or version is introduced.

## Operational boundary

The API requires AOF enabled, `appendfsync always` and `noeviction`. The durable runtime row pins the Redis process identity. An unexpected restart pauses acceptance and release until an operator reconciles durable outcomes and reservations under a reviewed recovery procedure. T09 does not silently rebuild lost state, release uncertain holds, or claim automatic disaster recovery; production recovery tooling remains a launch prerequisite. Normal API restarts against the same Redis process retain exact retry outcomes. Keep bidding disabled pending money/bid review.
