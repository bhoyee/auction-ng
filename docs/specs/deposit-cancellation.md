# Pending deposit checkout cancellation

2026-10-31. **MONEY/BID CHANGE — needs human review**

Owner-confirmed scope: pending deposits in Funding history. Withdrawal cancellation remains limited to drafts/review before provider submission.

## Contract

POST /payments/checkout/cancel accepts a strict paymentId UUID body, authenticated buyer and the existing payment mutation rate limit. It closes only an owned pending hosted card or one-time transfer funding checkout. A direct incoming DVA transfer cannot be cancelled through this endpoint. Completed/failed/verified deposits reject fresh cancellation; repeated cancellation returns the current closed/credited result. Typed API client and Swagger use the shared confirmation schema, extended with cancelled.

Cancellation sets only payments.checkout_cancelled_at. The underlying payment settlement status, immutable accepted amount/fee/credit contract and provider reference are preserved. No ledger operation, refund, hold release or provider cancellation call is made. History presents the row as Cancelled until verified credit occurs. Old hosted links may still accept money: any later verified successful payment remains eligible for exactly-once credit through the existing ledger service, even during a marketplace deposit pause. Replayed callbacks and simultaneous cancellation/confirmation cannot downgrade credited status or credit twice.

The cancel transaction obtains the same initialization-key advisory lock as checkout creation, followed by a payment-row lock. An initializer which sees cancellation refuses to return or reopen that local checkout. New deposits require a new idempotency key. The payment ID itself makes exact cancellation retries idempotent. Unknown payment responses are never treated as failed or refunded.

## Database

Migration 20261031000300_deposit_checkout_cancellation adds checkout_cancelled_at TIMESTAMPTZ(3), nullable, no default. The method CHECK permits non-null cancellation only for hosted funding with an initialization key. A trigger makes the timestamp immutable and allows first cancellation only from pending state; later credited settlement remains valid. No new relation, unique key or index: ownership/ID and history queries use existing primary/owner-cursor indexes. See [full database dictionary](database-schema.md). The underlying database status vocabulary does not gain a cancelled value; it is a local-checkout presentation state in shared payment schemas.

## Buyer UI

Funding history shows Cancel checkout only on eligible pending rows, with confirmation and Keep checkout. Explain that cancellation is local and does not reverse a payment already made. Show green success, red errors and a red Cancelled badge; retain pagination and silent refresh. Clear matching browser pending-payment tracking after confirmed cancellation. Account changes fence stale responses. Payment-return and pending-check dialogs explain cancelled checkouts without claiming a refund; verification remains available for payments arriving later.

No automatic checkout expiry or mass cancellation is introduced. No new dependency or environment setting.

## Validation

Sixteen targeted card/transfer funding tests pass, including repeated owned cancellation, ownership denial, immutable timestamp, no cancellation credit, checkout initialization race, exact-once late transfer credit, concurrent card success/cancellation and authenticated typed-client/strict-body checks. Relevant lint/types and API/worker/web production builds pass. Browser checks at 360/768/1280 px exercise confirmation/dismissal, network-error retry using the same ID, protected paid rows, cancelled history, cleared local tracking, return-page copy and silent late-credit updates. [Screenshots](../design/deposit-cancellation/README.md).

## Recovery UI amendment - 2026-10-31

The owner approved removing the standalone pending-payment dialog. Eligible pending hosted rows now expose Check status beside Cancel checkout. Verification uses the selected owned payment ID and funding method through the existing confirmation endpoints, regardless of browser checkout tracking. Successful verification refreshes balance/history silently; pending and failed checks show amount-specific feedback. Cancelled rows keep their existing cancelled state and payment-return explanation; webhook reconciliation continues to credit any later verified payment exactly once. No settlement behaviour changed. See [UI review](../design/funding-history-status/README.md).
