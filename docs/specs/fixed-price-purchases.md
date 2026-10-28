# Fixed-price purchases

**MONEY/BID CHANGE — needs human review.** Owner-approved rules, 2026-10-28.

Administrators can set or remove an optional fixed item price, independent of the current auction bid. Buyers can choose it even after bidding starts. The card shows a yellow trophy and Naira price directly below the condition badge. The existing bidding price and countdown remain separate.

## Price and payment

Shared `calculateFixedPrice` adds 750 basis points (7.5%) tax on the item price, with integer half-up rounding. No buyer premium or lot fee applies. The optional rate argument supports an explicit future policy revision; never reinterpret an accepted purchase. Item price, tax, processor charge and total must be accepted by the buyer and are saved immutably.

Wallet purchases debit the item-plus-tax total. Hosted Nigerian card and Pay with Transfer use Paystack's local checkout fee policy; hosted international card uses the existing international policy. `quotePurchasePayment` finds the smallest gross amount whose net covers the purchase, handling the local fixed-fee threshold separately to avoid overcharging. The buyer sees the processor charge before confirming. Any residual kobo stays in their wallet.

External payments do not require a prior wallet top-up. Internally the verified net payment is credited through the existing ledger, then applied to this specific purchase. If the purchase cannot complete, the funds remain available to the buyer; no redirect or client callback proves payment. Only signed provider webhooks followed by server-side re-verification, or explicit server-side confirmation, can credit funds. Match test domain, reference, buyer email, amount, currency, channel, fee and card tier. No live Paystack call is permitted.

Paystack references: [checkout channels](https://paystack.com/docs/api/transaction/), [Pay with Transfer](https://paystack.com/docs/payments/payment-channels/), [current transaction pricing](https://support.paystack.com/en/articles/2130306). Provider account expiry can exceed the marketplace's ten-minute stock reservation; never promise the bank account itself expires when the item reservation does.

## Reservations, concurrency and recovery

The stock reservation ends at the earlier of now plus ten minutes and the auction deadline. It never extends the auction. PostgreSQL locks and a partial unique index permit only one pending/paid purchase per lot. A Redis Lua guard serializes reservation acquisition with accepted bids and closing. Previously accepted bids remain in history; ready preparations cannot be accepted during checkout. Unpaid cancellation/expiry removes only the matching transient guard, then normal bidding/closing resumes.

Completion first fences the same reservation in Redis, records an accepted-stream barrier and persists accepted bids through that barrier. It then locks the buyer/lot/purchase and commits the ledger debit, paid invoice, zero auction fees, item tax, pickup QR fulfilment, notification and closed lot together. The buyer's own bid holds can fund the purchase by being released inside that transaction. Other bid holds are released idempotently in batches of at most 50, using the existing bid-release keys so the normal worker and purchase cleanup cannot release twice. A completion flag and partial index remove finished purchases from periodic recovery scans.

The normal closer skips paid purchases, so it cannot also charge the auction leader. A separate public-safe purchase socket publication uses a monotonically newer version and an ended timestamp; both public and authenticated lot viewers remove purchased stock promptly. No buyer identity, private bid maximum or payment details enter that channel. The existing catalogue refresh remains the fallback.

An expired or cancelled reservation never becomes payable again. A verified late payment is credited once to the buyer's wallet, without an invoice or automatic new purchase. If a payment was credited but completion fails, recovery retries while the reservation is valid; otherwise the credit stays in the wallet. Redis identity-loss recovery remains fail-closed under the existing bid-engine safeguards; it requires operator review rather than reconstructing a guessed winner.

## Contracts and storage

- `PATCH /admin/lots/:id/fixed-price`: active administrator with MFA; `{fixedPriceKobo: positive integer|null, expectedUpdatedAt}`. Row lock, optimistic version, encrypted before/after audit. Cannot edit closed stock or a current checkout reservation.
- `POST /lots/:id/purchases`: verified, active, eligible buyer; strict `purchaseInputSchema` with client UUID retry key, payment method and accepted price/tax/processing/total.
- `GET /purchases/:id`: own reservation only. Separate bounded status-read rate limit supports polling without weakening the payment-attempt limit.
- `POST /purchases/:id/confirm`: empty strict body, server verifies payment.
- `POST /purchases/:id/cancel`: empty strict body, cancels only the buyer's unpaid reservation. Later funds remain wallet credit.

All endpoints have Swagger schemas and a typed `createPurchaseClient`. Private checkout URLs are encrypted at rest. Browser access tokens remain in memory; only the purchase retry request/ID is saved in session storage for recovery.

Migrations `20261028000400_fixed_price_purchases` and `20261028000500_purchase_hold_recovery` are additive. The [33-table dictionary](database-schema.md) describes every column/type, foreign key, check, unique constraint and index. Purchase financial identity is immutable; terminal states cannot reopen. No existing migration or ledger table is rewritten.

## Preview and verification

Local buyer: http://localhost:3300/; staff: http://localhost:3301/. Four unused labelled demo lots have fixed-price examples. `pnpm demo:fixed-prices` is explicitly guarded to the local demo database and refuses used stock; it never changes bid history, timers or ledger data.

```powershell
pnpm db:generate
node scripts/check-purchases.mjs
node scripts/check-purchases.mjs --closing --bids --realtime
pnpm --filter api build
node --import ./apps/api/node_modules/tsx/dist/loader.mjs scripts/check-purchase-ui.mjs
node --import ./apps/api/node_modules/tsx/dist/loader.mjs scripts/check-admin-top-deals-ui.mjs --fixed-price
```

These helpers create and retain isolated test databases. Browser purchase tests use a synthetic provider and isolated funded buyers, never actual demo wallets or a live gateway. The local demo intentionally has no payment secret; configure a Paystack **test** key and webhook to exercise real provider-hosted checkout. Provider account enablement and human money/bid review remain required before production. Native purchase screens remain outside this web/admin change.

Local validation: 153 focused tests pass across fee/shared rules, purchase API/concurrency/recovery, closing, bid funding/persistence/Lua, realtime, staff permissions, receipt emails and the schema dictionary. Changed fee maths has 100% line coverage. Existing 500-contender concurrency, 10,000 mixed bid-rule cases and 1,000-lot closing checks pass; durable bid p95 is 17.41 ms and 1,000-viewer socket p95 is 282.11 ms in the local checks. API, web, admin and realtime builds pass, as do affected lint/type checks. Buyer/admin browser reviews pass at 360/768/1280 px. All nine local services are healthy. Full CI checks remain enabled; no full unrelated local suite or live gateway call was run.

For provider-hosted testing, put the test secret in your private `.env.demo` and restart the API through the demo Compose override. The provider rejects live secrets. Keep keys out of Git and chat. Four unused demo lots currently expose the trophy price; wallet purchases require a signed-in eligible buyer and enough funds. Staff account provisioning remains the existing operator-only setup step.
