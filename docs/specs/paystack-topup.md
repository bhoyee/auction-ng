# Paystack card and bank-transfer wallet funding (T06)

This integration accepts **test keys only**. It creates no live accounts and makes no live payments. The owner approved buyer-paid Paystack charges: wallet credit equals the amount received minus the provider fee. No Auction NG top-up markup is added.

The owner also approved card funding in T06. Bids remain fully backed by available wallet funds. Outbid reservations return to available wallet balance; they do not trigger bank/card refunds. Paystack's [card preauthorization documentation](https://paystack.com/docs/payments/card-preauthorization/) currently limits card holds/capture/release to registered South African businesses, so Auction NG does not expose that feature for Nigeria.

## Hosted card funding

Paystack's [published Nigerian pricing](https://paystack.com/pricing), checked 2026-10-25, is 1.5% plus NGN 100 for local cards, with the NGN 100 waived below NGN 2,500 and the total fee capped at NGN 2,000. International cards are 3.9% plus NGN 100 without that local cap. All calculations use integer-kobo half-up arithmetic in `quoteCardFunding()` in the shared fees module. Versions are `paystack-card-local-v1` and `paystack-card-international-v1`.

For NGN 10,000 charged, a local card quote is NGN 250 fee / NGN 9,750 wallet credit; an international quote is NGN 490 fee / NGN 9,510 credit. The chosen tier, exact fee, net credit and consent must be accepted before initializing checkout. If the actual card issuer tier or verified fee differs, automatic credit stops for review rather than silently changing the deduction. Processing fees are incurred when funding, even if the buyer later loses an auction.

- `POST /payments/card/quote` accepts `{ amountKobo, cardType: "local" | "international" }` and returns the charge, fee, net credit, currency and policy version. No provider key is needed to calculate a quote.
- `POST /payments/card/initialize` additionally requires `feePolicy`, `acceptedFeeKobo`, `acceptedCreditKobo`, `consent: true` and a client-generated UUID `idempotencyKey`. It returns a `paymentId`, the accepted breakdown and a Paystack-hosted `authorizationUrl`. Open that URL in the browser; Auction NG never accepts PAN, CVV or raw card details. This collects money; it is not a card hold.
- `POST /payments/card/confirm` accepts your `paymentId` and returns `pending`, `failed` or `credited`. The server re-fetches Paystack before first credit. A browser redirect or a client claim of success cannot credit funds. Verified webhooks can complete the same intent independently and idempotently.
- `POST /payments/refund-requests` accepts an owned credited `paymentId`, positive `amountKobo`, reason and UUID `idempotencyKey`. It returns a request ID and `requested` status. This is a request for review, not a completed refund. It is capped by the payment's original net credit and available wallet funds at request time; funds stay available and are rechecked by the later execution workflow. Reasons and request receipts are encrypted, and retries create one audit record.

Refund requests work for both bank and card funding. Staff processing, actual provider refunds/withdrawals, destination verification and execution controls remain separate reviewed work. No automatic external refund occurs when a hold is released, and creating a request does not reserve funds or guarantee approval.

Card funding requires a verified buyer email and an existing/new empty wallet; it does not require a DVA or mark the phone verified. A server-generated reference and immutable intent bind the buyer, wallet, gross amount, fees, net credit, issuer tier and consent. Checkout uses `channels: ["card"]`, NGN and a fixed HTTPS Paystack API host. Returned checkout links must use `https://checkout.paystack.com`; stored links are encrypted and buyer-only. No card details, authorization tokens or provider access codes are stored in payment records.

Concurrent initialization retries share one checkout. An uncertain provider initialization is retained without issuing another checkout on the same key; check its payment status rather than starting a duplicate payment. Exact successful retries return the same stored URL. Only verified, owned, successful NGN/test card transactions with matching amounts, fee and issuer tier reach the ledger. Pending, declined, foreign-owner and unbound card transactions create no spendable funds.

Receipts identify `fundingMethod` as `card` or `bank_transfer` and show gross/fee/net amounts. Nightly reconciliation includes only `auction-card-` references from card transactions, alongside DVA transfers, and compares their accepted intent, ownership and ledger credit. Other products' card transactions are excluded. Checkout return routing and visible payment/refund-request screens remain D01/T13/T14; the typed API clients are ready for them.

## Fee disclosure

Paystack's [dedicated virtual account pricing](https://support.paystack.com/en/articles/2124866), checked 2026-10-24, is 1% per transaction capped at NGN 300. This differs from generic checkout/card pricing. `quoteBankTransfer()` in `packages/shared/src/fees.ts` uses bigint intermediates and half-up rounding once to integer kobo. The version is `paystack-dva-v1`.

| Amount received | Paystack fee | Wallet credit |
| --------------- | ------------ | ------------- |
| NGN 10,000      | NGN 100      | NGN 9,900     |
| NGN 30,000      | NGN 300      | NGN 29,700    |
| NGN 50,000      | NGN 300      | NGN 49,700    |

Before showing transfer instructions, buyer screens must call `POST /payments/quote` and show all three amounts, with the fee labelled as a Paystack fee. The buyer enters the total they intend to transfer, not a desired net credit. Any charge imposed separately by the sending bank is outside the amount Paystack receives and is excluded from this quote. A different transfer amount produces a different quote; permanent virtual accounts cannot force the amount sent from a bank app.

T06 supplies the quote and receipt APIs and typed client. Visible web/mobile payment screens remain D01/T13/T14 and must display this disclosure before confirming a transfer. The existing placeholder screens do not yet show a payment form.

## Buyer endpoints

Use a buyer access token and its `X-Device-Id`. All responses are private and `no-store`; rate limits apply per buyer and IP. Unknown input fields are rejected.

- `POST /payments/quote`, body `{ "transferKobo": 1000000 }`: returns `{ transferKobo: 1000000, feeKobo: 10000, creditKobo: 990000, currency: "NGN", feePolicy: "paystack-dva-v1" }`. This works without a configured provider key and never moves money.
- `POST /payments/virtual-account`: requires first/last name, Nigerian phone, BVN, existing bank code/account number for validation, explicit `consent: true` and the accepted `feePolicy`. Local phone input is normalised to E.164. Email comes from the verified buyer profile, never request data. Account setup requires Paystack configuration.
- `GET /payments/virtual-account`: returns `not_requested`, `pending`, or the assigned bank name/account number with `testMode: true`. Asynchronous assignment is retrieved through Paystack's customer API. It must report a test-domain, identified customer and an active, assigned NGN account. This endpoint supports polling while setup is pending.
- `GET /payments/history?limit=20&cursor=…`: buyer-owned receipts with received amount, actual Paystack fee, net wallet credit and status. Cursor pagination uses descending creation time and ID, maximum 50 rows, one indexed query, with no per-row queries. Internal references and personal identity data are excluded.

`createPaymentClient` in `packages/api-client` validates these responses. Swagger documents the endpoints at `/docs`. No browser/mobile payment screens or SMS verification are added here.

## Consent and personal data

Consent and the accepted fee-policy version are persisted before sending identity details to Paystack. BVN is stored using the existing authenticated encryption and keyed lookup hash. Account numbers are encrypted. Full bank/BVN data and provider responses are never logged. Bank-validation input is sent only to the fixed Paystack HTTPS endpoint and is not retained as plaintext. Phone input in this flow never edits or verifies the authentication phone.

The single-step [Paystack assignment flow](https://paystack.com/docs/payments/dedicated-virtual-accounts/) sends identity details to `test-bank`. KYC remains pending until customer retrieval confirms identification and account assignment. Rejected/incomplete identity results do not create a usable account. Production consent wording, business eligibility and live credentials remain human responsibilities before launch.

## Webhooks and recovery

`POST /payments/webhook` requires an HMAC-SHA512 `x-paystack-signature` verified against the original raw body with a constant-time comparison. A signed `charge.success` supplies only a reference to look up; amounts and customer ownership are re-fetched from Paystack's [verification API](https://paystack.com/docs/api/transaction/).

Credit requires the same reference, test domain, NGN currency, successful status, DVA channel, a locally linked customer, explicit consent, safe integer amount/fees and an actual fee equal to the disclosed calculation. Unexpected fees, foreign accounts/currencies/channels and invalid transfers fail closed. Unknown signed event types are acknowledged without changing money. A failed verification or database operation is not acknowledged as successful, allowing provider retry. The provider key is never exposed in buyer responses.

The payment record stores gross, fee and net kobo with a database equality constraint. Native insert-on-conflict handling makes concurrent provider retries safe. A deterministic hash of the provider reference forms the ledger idempotency key and unique ledger reference. Only `LedgerService.topup()` credits the net amount. Payment status becomes `credited` after the ledger commit. If the process stops between those steps, the next verified retry returns the original ledger receipt and repairs payment status without a second credit. Reconciliation also reports that intermediate state. There is no automatic repair from an unverified or mismatched report.

## Reconciliation

When `RECONCILIATION_TOKEN` is configured, the existing BullMQ worker schedules a job at 01:00 Africa/Lagos, with five attempts and exponential backoff. It calls the private `/payments/reconcile` endpoint using a separate server-only token. The API fetches successful DVA transfers and locally scoped card payments for the previous UTC day in pages of 50, re-verifies them and compares ownership, gross/fee/net amounts, credited status and the ledger receipt. It also detects local records absent from provider results. Card checkouts that remain uncredited appear as mismatches rather than creating funds.

Reports are encrypted into `audit_log` under `payments.reconciliation`. The worker retains only a mismatch count and emits a generic warning for mismatches. Provider failures fail/retry the job; individual verification failures appear as mismatches. The job does not credit funds or alter ledger rows. The worker never imports the ledger or needs a Paystack secret. Missing configuration leaves provider-dependent routes and scheduled reconciliation disabled; quote/history and the rest of the local stack remain usable.

## Tests and remaining acceptance

Tests cover fee cap/rounding/safe integers, exact raw signatures, fixed provider endpoints, test-only keys, asynchronous account lookup, three simultaneous service and HTTP webhook deliveries, forged bodies, wrong owner/currency/channel/fees/status, crash recovery, encrypted data, owner receipts and reconciliation mismatches. These tests use a synthetic provider and mocked HTTP responses in isolated databases. They do **not** prove a transfer through Paystack's actual sandbox.

The Paystack test key was not configured during implementation. The outstanding end-to-end sandbox check is documented in [T06 validation](../t06-validation.md). Human review is required before merging this money change. T07 has not started.
