# Auction fee controls

## Owner-approved scope

- Display "Service charge" instead of "Buyer premium" in buyer-facing breakdowns, policies, invoices and receipts. Existing internal `premiumKobo`/`premiumBps` field names and stored amounts remain compatible.
- Admin controls for service charge percentage, lot fee amount in Naira and VAT percentage on those fees, each with its own enabled switch.
- Changes must also apply to existing auctions; they are not restricted to newly published stock.
- Buy Now item tax remains separate and unchanged.
- Fee details and final confirmation must show the policy actually applicable to that auction and bid.

## Confirmed rule (2026-11-01)

Updates apply to new auctions and existing auctions with **no accepted bids**. The first accepted bid freezes the auction's policy through settlement. A pending preparation is not an accepted bid: if fees change before confirmation, reject the stale preparation and require the buyer to review again.

## Implementation requirements

- Persistent, versioned fee settings; strict shared Zod schemas and integer basis points/kobo.
- Admin-only authenticated updates with role/session checks, an audit record, idempotency and stale-edit protection.
- A fee-policy snapshot/version shared by popup, preparation, atomic confirmation, wallet reservation and final invoice.
- No rewritten historical invoices or ledger entries, and no default-fee fallback for an unknown policy.
- Concurrent fee update/bid tests, exact retry tests and verification of settlement against the agreed policy.
- Additive Prisma migrations and an updated table/column/relation/index/constraint dictionary.
- Typed client and Swagger endpoints, responsive admin controls and buyer disclosure screenshots.

## Implementation

`auction_fee_policies` stores immutable configurations; `auction_fee_controls` selects the current revision. Existing accepted auctions are backfilled to the legacy policy. Funding intents, settlements and pinned lots reference their policy through foreign keys. A database trigger prevents changing a pinned lot's policy.

Activation uses a monotonic Redis revision. The first bid and fee activation execute atomically in Redis: an earlier accepted bid pins its original version, while an earlier activation rejects an old preparation. A pending preparation alone does not lock fees. Rejected reservations can be released through the existing cancel/reconciliation path.

Only an active administrator with a current two-factor staff session may save settings. Saves require an audit reason, expected revision and idempotency key. Audit records are encrypted. If PostgreSQL commits but activation fails, retry the same request; it does not create another policy or audit entry. Startup also reconciles the active pointer. Unknown policies fail closed.

The buyer popup, confirmation, reservation and settlement use the applicable policy. The read-only quote refreshes on focus/online and every 15 seconds while visible. A changed version closes an unsubmitted confirmation; uncertain bid operations preserve their original amount, mode, policy and key. Final acceptance always checks the policy atomically, including between refreshes. Buy Now tax and payment processing remain unchanged.

Endpoints: public `GET /lots/:id/auction-fees`; administrator `GET`/`POST /admin/auction-fees`. All use shared strict Zod schemas, Swagger documentation and typed clients. No new dependency or environment variable is required. The mobile buying UI remains part of T14; an old client assuming legacy fees is rejected safely on newer policies.

**MONEY/BID CHANGE — needs human review.**

## Verification

Targeted lint and affected type/production builds pass. Tests cover all eight enabled/disabled fee combinations, exact rounding, input validation, ordered activation, 50 first-bid/activation races, stale preparations and their release, retained old fees, settlement at old and new rates, admin authorization/session expiry, conflicting edits, immutable policies, exact retries and interrupted activation recovery. The affected bid regression suite also exercised 1,000 mixed lot closures; its old receipt label and isolated Redis fixture were corrected and rechecked individually. No unrelated full-site suite was rerun.

Admin and buyer screenshots at 360/768/1280 px: [review](../design/auction-fees/README.md). The complete migrated database dictionary lists the new tables, columns, relations, indexes and constraints in [database-schema.md](database-schema.md). The local Docker preview includes the additive migration and updated services.
