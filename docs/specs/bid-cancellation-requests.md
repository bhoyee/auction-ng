# Live bid cancellation review requests

Owner approved 2026-11-02. Accepted live bids remain binding. Pre-bid cancellation before launch remains a separate existing feature.

Signed-in buyers with an accepted bid see their latest accepted direct bid/private limit on the item detail page, alongside: “Accepted bids cannot be cancelled. Reserved funds are released when you’re outbid.” Bid now remains available for valid raises. The commitment comes from the private persisted bid history; live position/price still comes from Socket.IO.

Request bid cancellation opens a reason form with explicit acknowledgement. It sends an encrypted conversation directly to human support, including the friendly item reference and item link. It does not pause the auction, remove a bid, reprice an item, release a hold, refund money or change closing. No OTP is requested because this is a support message, not a financial operation. Staff reply/claim/resolve through the existing support queue. Resolution is labelled as conversation resolution, never cancellation approval.

## Typed API

- `GET /support/lots/:id/bid-cancellation`: authenticated buyer only; own latest commitment and linked conversation, with whether a new request may be made.
- `POST /support/lots/:id/bid-cancellation`: strict reason (10–1,000 characters), `acknowledged: true` and UUID `idempotencyKey`. A new request requires an owned accepted bid on a currently open lot before its deadline.

Endpoints have Swagger schemas, no-store responses, existing support read/write actor/IP rate limits and current session/MFA checks. Contracts live in shared support schemas and the typed support client. They never accept a buyer ID from the caller or expose another buyer’s limits.

There is one conversation per buyer/lot. A server-derived keyed request identity reuses the existing unique `(created_by_id, create_key)` index, including across devices and concurrent requests with different client keys. The first committed reason wins; subsequent submissions return that conversation, including after closing/resolution. Follow up or reopen through the existing chat. Ambiguous browser sends retain the same input/key for retry. Existing daily conversation limits apply.

No migration, dependency or environment variable is needed. The own-bid query uses `bids_user_lot_history_idx`; conversation lookup uses the existing creator/key unique index. No unbounded support-list search is used. History shows status beside each displayed item and retains pagination. Status reconciles silently every fifteen seconds and on focus/reconnection; item commitment also refreshes after a bid-related wallet event. Account changes remount the private component.

## Verification

New isolated integration tests cover ownership, roles/validation, concurrent duplicate submissions, private commitment, request persistence, closed auctions and unchanged bid/ledger records. The relevant support API/realtime/worker suite passes (21 tests). Affected API/web/UI types, changed-file lint and API/buyer builds pass. Responsive browser workflows cover reason/acknowledgement, lost-response exact retry, retained Bid now, item/history status updates and no calls to bid/payment mutation endpoints.

Screenshots and report: [bid review UI](../design/bid-cancellation-requests/README.md).

Native mobile screens remain T14. Automated approval, cancellation, repricing and release controls are intentionally outside this request; they require separate auction/money rules and review.
