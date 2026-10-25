# Funded bid acceptance (T09)

**MONEY/BID CHANGE — needs human review.** This implements the owner-approved [reservation contract](bid-funding-proposal.md). It adds no buyer screens, payment-provider calls, bid-row persistence or winner charging. T10 consumes the accepted stream; T12 freezes results and settles invoices.

## Buyer contract

All three buyer operations require the original bearer token and installation UUID in `X-Device-Id`. Tokens/proof bindings are never logged. Responses use `Cache-Control: no-store`. Inputs reject unknown fields.

| Endpoint                            | Body                                                 | Result                                                                                                                                      |
| ----------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /lots/:id/bid-preparations`   | `maxKobo`, optional `mode`, UUID `idempotencyKey`    | Preparation UUID, bound retry key, selected mode, lot, amount/maximum, full estimated total, additional reservation, expiry and fee version |
| `POST /lots/:id/bids`               | UUID `preparationId`, original UUID `idempotencyKey` | Accepted result, personal leader flag, displayed price, end time, server time and stream ID                                                 |
| `POST /bid-preparations/:id/cancel` | Empty object                                         | Terminal/current preparation status; accepted leading bids cannot be cancelled here                                                         |

`createBidClient()` is shared by web and mobile. Clients generate one UUID for a preparation and reuse it for confirmation/retries. A confirmation response never contains bidder identities, another buyer's maximum, session identifiers or wallet information. OpenAPI documents the public routes. Errors use the existing safe exception filter.

### Owner-approved bid choices

New preparations default to `mode: 'direct'`. Here `maxKobo` is the exact amount offered: a first direct bid of ₦5,000 displays ₦5,000, and a winning direct bid sets that submitted price. Subsequent bids must meet the current displayed price plus its configured increment. A direct bid does not authorise later automatic raises.

Automatic bidding requires explicitly sending `mode: 'automatic'`; `maxKobo` then means the private spending limit. A first ₦10,000 automatic limit on a ₦500 lot displays ₦500. A competing ₦5,000 direct bid triggers the earlier automatic leader's ₦5,100 counterbid. A direct bid above that private limit wins at its full submitted amount. Equal maxima retain the earlier leader; a direct bid cannot override an earlier equal automatic limit. In either mode, `isLeader: false` means accepted but immediately outbid, not a winning bid.

The reservation always covers `estimatedTotal(maxKobo)`: the direct amount or automatic limit plus fees. Leading raises reserve only the additional total. A leader's new automatic limit leaves the displayed price unchanged; a direct raise sets the new displayed price and must also meet the next increment. Neither choice reduces an already accepted commitment: own bids must exceed the existing private maximum, even if the displayed price is lower. Lowering/cancelling an accepted automatic limit is not offered by this change.

Both preparation and confirmation receipts identify the buyer's own selected mode. Confirmation accepts only the preparation ID and retry key; it cannot change the funded amount or mode. Reusing a preparation key with a different mode conflicts. The database mode is immutable and validated by a check constraint; accepted stream events include it for T10. Existing durable intents are migrated as automatic; missing mode in an old Redis proof is interpreted only as legacy automatic, never direct. Old accepted replies likewise retain their automatic meaning.

The later buyer screen must present **Place a bid** as the default and **Bid automatically up to…** as an explicit optional choice. Before confirmation it must show the selected action, fees and reservation; explain that an existing automatic limit can counter a direct bid immediately. No selector screen, masked leader identities or live public bid history is added here; those depend on the later design, realtime and persistence tasks. Other buyers' limits remain private.

Deploy the API version consistently with the migration and updated clients while bidding is paused; do not run old proxy-only API instances alongside direct-capable instances. Bidding remains disabled by default pending review and settlement readiness.

Preparation authenticates against PostgreSQL and rechecks ownership, active buyer role/status, verified phone, fewer than three active strikes, session/access expiry and wallet. It locks user/session rows against revocation and uses the ledger's wallet lock to serialize spending across lots. Both the immutable funding intent and its additive double-entry hold commit in the same transaction. Only then may Redis receive its single-use funded proof. If publication fails, the funded intent remains recoverable for cancellation/expiry; it cannot create an unfunded bid.

A leader's raise reserves `estimatedTotal(newMax) - estimatedTotal(oldMax)` in a separate hold. Its proof also binds the previous maximum and group. If another bid changes that basis, confirmation rejects and cleanup releases the unused extra hold. Accepted leading holds stay reserved beyond preparation expiry. Fees/increments/soft close and schemas originate in `packages/shared`; fee version changes require a reviewed transition for already-open lots.

## Redis transaction

The final endpoint deliberately bypasses the database auth guard: its server-issued proof binds the already-verified session, bearer token, installation, lot, maximum, full funded total, additive reservation, fee version and retry key. The Lua script uses Redis server time, checks expiry/revocation/open state/minimum/held proof, applies the shared proxy rules and 120-second soft close, records the exact result, appends to a Stream and publishes the public price update in one script. The API preloads the script and invokes `EVALSHA`; it never resends the full source or retries an uncertain mutation automatically. Exact accepted retries return the original result even after another bidder leads. They never create another event or hold. Returned prices/leader flags describe that acceptance time, not a new live-state read; future screens must reconcile them with T11 updates.

Redis cjson ordinarily truncates large integer output precision. The script's integer serializer emits exact integer JSON literals; subtraction before capped addition avoids unsafe intermediate sums. Tests compare 10,000 deterministic cases against `resolveBid()`, including near-safe-integer limits, alongside concurrent contenders and durable request timings.

Private keys use the `auction:bids:v1:` namespace: `lot:<uuid>`, `proof:<uuid>`, `groups`, `revoked`, `accepted`, `runtime` and short-lived hashed-IP/global rate buckets. Proofs, groups and accepted events have no automatic TTL or stream trimming: deleting an uncertain outcome would make safe release impossible. Retention/archival must be designed with T10/T12 recovery. Public pub/sub contains only lot UUID, displayed price, end time and server time.

## Release and revocation

BullMQ calls the private `POST /internal/bids/maintain` route every second with a separate secret of at least 32 characters. It warms up to 50 newly open lots per pass without overwriting live state, rotates through at most 50 nonterminal intents per pass, cancels expired ready proofs atomically, and releases only outcomes Redis has made unconsumable. The ledger alone posts releases, using a unique intent-derived key and wallet row lock. A crash after release but before the intent acknowledgement replays the same ledger receipt. Outbid groups release all their additive holds to the wallet. Accepted leading preparations remain held. Large backlogs delay availability after expiry; they never extend a proof's acceptance window.

Logout/refresh locks affected session rows, durably revokes their Redis proofs, then commits PostgreSQL revocation. `BidService.fenceEligibility(tx, userId)` provides the same boundary for future staff suspension, strike and phone/role changes. Database triggers reject unfenced mutations after bidding runtime initialization. If fencing fails, the security mutation cannot report success. A new session is required after its old one has been fenced.

## Failure boundary

Bidding requires Redis AOF enabled, `appendfsync always`, `maxmemory-policy noeviction`, and command deadlines. PostgreSQL pins the Redis process identity; a database-bound namespace marker prevents silently adopting another database's state. Automatic Redis reconnect is disabled. Lost replies pause that API's engine; restarting the API against the same Redis process can retrieve its durable exact outcome. An unexpected Redis restart, lost marker or missing retained proof requires reviewed reconciliation before acceptance or release resumes. Uncertain funds stay reserved.

This is a deliberate operational stop, not automatic disaster recovery. Do not delete runtime rows/Redis keys, reset the namespace, mark uncertain intents released, or change the recorded Redis identity to make startup pass. Production backup/restore and recovery tooling is a launch prerequisite. PostgreSQL/Redis backups must be reconciled together before bidding resumes after a restore.

Keep `BIDS_ENABLED=false` until money/bid review and the later persistence/settlement tasks are ready. Test fixtures use isolated databases and random Redis namespaces; they do not publish demo stock, fund real users, or call Paystack.
