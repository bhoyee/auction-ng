# One-time transfer funding and wallet refresh

Owner-approved 2026-10-30. **MONEY/BID CHANGE — needs human review.**

## Funding flow

Balance → enter whole-Naira amount → One-time bank transfer → Show fee and wallet credit → explicitly accept the fee → Paystack hosted transfer-only checkout. Paystack supplies the temporary account and expiry. The buyer transfers the exact checkout amount using their bank app. The hosted account is not a reusable DVA, and does not require our personal-account setup form. The existing optional personal transfer account remains separate.

Authenticated, buyer-owned, rate-limited endpoints (strict Zod, typed client, OpenAPI):

- `POST /payments/transfer/quote`: `{ amountKobo }` → gross amount, fee, net credit, NGN and `paystack-transfer-v1`.
- `POST /payments/transfer/initialize`: amount, accepted fee/net, matching policy, consent and UUID idempotency key → owned payment ID and validated hosted authorization URL.
- `POST /payments/transfer/confirm`: `{ paymentId }` → pending, failed or credited after provider verification; never trusts browser success claims.

The shared quote uses Paystack's standard Nigerian local-channel tariff: 1.5% plus ₦100, fixed fee waived below ₦2,500, total capped at ₦2,000. This differs from reusable DVA funding (1%, capped at ₦300). Example: transfer ₦10,000 through checkout → disclosed fee ₦250 → wallet credit ₦9,750. The buyer covers the fee, not Auction NG. Quote arithmetic remains integer kobo, half-up, and in packages/shared; no copied fee arithmetic in the UI/API. [Paystack pricing](https://support.paystack.com/en/articles/2130306), checked 2026-10-30.

Checkout-only intents use funding method `checkout_transfer`, null card tier, a separate policy/reference prefix and persisted accepted gross/fee/net/consent. Initialization retries share a single provider request; uncertain outcomes do not issue another checkout. An additive migration extends the allowed funding variant while retaining all existing variants, immutable-intent trigger and net-amount constraints. No ledger schema or posting algorithm changes.

Signed webhooks re-fetch Paystack and match the immutable intent, verified buyer email, reference, NGN/test status, bank_transfer channel, amount and exact accepted processing fee. Unbound/wrong-owner/wrong-channel/wrong-amount/fee payments cannot credit the wallet. Ledger top-up remains idempotent by provider reference under concurrent webhook/confirmation deliveries. Reconciliation includes the separate transfer-reference/channel pair and the same intent verification. Existing cards, DVA funding and fixed purchases remain distinct. Return URL uses kind `wallet_transfer`; the protected return page calls the owned transfer confirmation endpoint.

## Silent refresh and status presentation

Wallet data reconciles every fifteen seconds while visible/online, and on focus, online and wallet-change events. Use balance GET reads; only open an empty wallet if it does not exist. Keep the loaded snapshot and form during background requests; coalesce overlapping refresh requests and ignore obsolete owner/device/page replies. Sidebar balance refresh follows a successful page read without triggering a page-read loop. Changing account/page never exposes the old snapshot. On background error retain last confirmed data with a clear stale-data notice; never silently represent unavailable values as fresh or change money. First load keeps the skeleton/error state. Inputs, quote, open bank form and scroll position survive background refreshes.

The payment-status page uses a large bold heading and Lucide check, cross or clock. Failed is visibly labelled Payment failed, pending is never called success, and terminal expired purchases retain the explanation about late verified credit. Back to balance/Purchase history is an indigo action with hover/focus feedback and reduced-motion support.

## Bank-picker correction

The real Paystack bank endpoint returned 200, but codes such as `C08` and `MFB51116M` failed the former numeric-only schema and rejected the entire page. Shared bank-code validation now permits bounded alphanumeric provider codes (3–20 characters), including personal-account input validation. The adapter successfully loaded fifty real test-mode bank records after the correction. Do not invent bank lists or suppress provider errors. No BVN/account-creation requests were made during this check.

## Validation and limits

Focused fee/provider/bank/wallet integration checks cover tariff boundaries, strict accepted quote, five simultaneous initialization retries, ten repeated webhook deliveries plus confirmation, mismatched verification rejection, typed protected endpoints, one credit and reconciliation. Browser checks at 360/768/1280 cover transfer checkout navigation, real timer-driven refresh, delayed/failed refresh retention, preserved input, bank picker and confirmed/failed states. [Screenshots and results](../design/payment-return/README.md).

No live payment endpoints were called and no actual hosted transfer payment was made. Test credentials and webhook connection remain configured; actual Paystack hosted transfer acceptance and human financial review remain required. T06 remains open. No new dependencies or unrelated full-site tests.
