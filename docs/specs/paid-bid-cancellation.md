# Staff-approved paid bid cancellation

Owner approved 2026-11-02. This supersedes the earlier unimplemented runner-up promotion proposal. Accepted live bids remain binding until an authorised admin completes a reviewed cancellation.

## Behaviour

- Sending a review request is free. The buyer explicitly acknowledges the fee basis; legacy review requests have no fee consent until the buyer confirms it from the item page.
- Approval uses the auction's pinned effective Service charge percentage on its current public bid price. Round half up once in integer kobo. There is no lot fee or added auction-fee VAT on this cancellation charge. Disabled service charge produces a zero cancellation fee. No charge is made for a rejected, stale or unfinished pre-commit approval.
- Leader cancellation captures only that fee from the existing reservation and releases the rest. Reopen with no leader at the original starting price; earlier bids become history and require fresh buyer action. Keep the later of the existing deadline and ten minutes after reopening. Ordinary soft close continues for fresh bids.
- Non-leader cancellation keeps the leader, price and deadline. Charge available wallet funds; if they cannot cover the fee, approval fails without cancellation or a negative balance. Do not take funds reserved for other commitments.
- The cancelled buyer is blocked from new bids on that item in API preparation, Redis confirmation and buyer UI. This applies across sessions and bidding rounds. Other cancelled buyers are excluded from future rebid invitations.
- Pre-bids remain freely cancellable before launch. After activation they follow live bid rules.

## Staff controls and contracts

Only active `admin` sessions with staff MFA can approve. Support staff may discuss/resolve conversations through existing permissions, but conversation resolution alone never cancels a bid. The admin support desk shows a current fee quote, buyer/item, effect on the auction, audited reason and explicit confirmation. Buyer consent is required before a quote can be approved.

- `GET /admin/bid-cancellations/:conversationId`: typed current public price, service percentage, cancellation fee, stream revision and approval status.
- `POST /admin/bid-cancellations/:conversationId/approve`: strict expected stream/fee, reason and UUID idempotency key. Actor/IP rate limits, current session/MFA checks, Swagger and typed support client apply.
- Buyer `POST /support/lots/:id/bid-cancellation` additionally requires `feeAcknowledged: true`; confirmation creates an encrypted, timestamped consent record. Private reads expose fee percentage/consent and blocked state only to the owner.

An old stream quote is rejected before charging. Exact retries return the original durable outcome. Different concurrent keys for the same conversation join its active approval instead of charging again. Staff-session renewal replays the exact same body and key. A failed attempt may be reviewed and submitted again with a fresh quote/key.

## Durability, money and races

The additive migration `20261102000100_bid_cancellation_approvals` adds consent timestamp, lot/funding rounds and approval records. It preserves immutable bid history. The [database dictionary](database-schema.md) documents all columns/types, relations, indexes and constraints, including one active approval per conversation and immutable committed contracts/funding rounds.

1. Commit the audited, authenticated approval intent before touching Redis.
2. Atomically fence the matching live stream revision against bid confirmation, purchases and closing. Reject expired/closed lots, launch activity or an existing purchase reservation. Snapshot the price, group and stream barrier with Redis server time.
3. Persist accepted bids through that barrier before settlement. In a PostgreSQL transaction, lock the approval, auction and wallet; charge through the ledger service only, release unused funds, advance the round/deadline when reopening and commit the encrypted outcome. Insufficient funds or changed conditions roll back before releasing the fence.
4. Atomically commit the Redis outcome, block the cancelled buyer, append a verified cancellation control event to the existing stream and publish the update. Finalise the support message and notification outbox once. Bounded maintenance resumes interrupted operations; a committed charge is never rolled back or repeated merely because its response was lost.

Funding proofs carry their round. Old ready proofs cannot bid in a reopened auction; accepted historical retries remain historical receipts, not new bids. Stream control events are accepted by persistence only for a matching committed/completed approval in the same namespace. New stream IDs remain ordered before subsequent bids. Original fee policies remain pinned across reopening.

The live-price gateway projects a leader reset to all viewers without private limits. Bid History marks the cancelled buyer and previous-round records distinctly. Wallet activity labels the fee and release accurately. Normal silent wallet/history/notification reconciliation remains enabled.

## Notifications and checks

The cancelled buyer receives an encrypted email/in-app notice with the charged amount and percentage. Prior bidders and watchers receive a fresh-bid invitation, current deadline in WAT and item link; no private maxima or other buyer identity is disclosed. Fanout is keyset-paginated in batches of 50 with unique references; delivery reuses SMTP/EmailProvider and the existing notification outbox. No native push availability is claimed before T14.

Verification: nine isolated cancellation ledger/concurrency/HTTP/Socket.IO tests; 66 affected bid, persistence, closing and purchase regressions (including 1,000 mixed closures); 21 support regressions; ten fee/email/client tests; pre-bid regressions; changed-file lint/types, affected production builds and 360/768/1280 buyer/admin browser workflows. [Screenshots and browser reports](../design/paid-bid-cancellation/README.md).

No dependency, paid service or environment variable was added. Local demo migration and affected Docker services are updated. No existing local buyer bids were cancelled or charged for preview/testing.

**MONEY/BID CHANGE - needs human review before production.**
