# Paystack bank-transfer funding (T06)

This integration accepts **test keys only**. It creates no live accounts and makes no live payments. The owner approved buyer-paid Paystack charges: wallet credit equals the amount received minus the provider fee. No Auction NG top-up markup is added.

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

When `RECONCILIATION_TOKEN` is configured, the existing BullMQ worker schedules a job at 01:00 Africa/Lagos, with five attempts and exponential backoff. It calls the private `/payments/reconcile` endpoint using a separate server-only token. The API fetches successful DVA transfers for the previous UTC day in pages of 50, re-verifies them and compares ownership, gross/fee/net amounts, credited status and the ledger receipt. It also detects local records absent from provider results.

Reports are encrypted into `audit_log` under `payments.reconciliation`. The worker retains only a mismatch count and emits a generic warning for mismatches. Provider failures fail/retry the job; individual verification failures appear as mismatches. The job does not credit funds or alter ledger rows. The worker never imports the ledger or needs a Paystack secret. Missing configuration leaves provider-dependent routes and scheduled reconciliation disabled; quote/history and the rest of the local stack remain usable.

## Tests and remaining acceptance

Tests cover fee cap/rounding/safe integers, exact raw signatures, fixed provider endpoints, test-only keys, asynchronous account lookup, three simultaneous service and HTTP webhook deliveries, forged bodies, wrong owner/currency/channel/fees/status, crash recovery, encrypted data, owner receipts and reconciliation mismatches. These tests use a synthetic provider and mocked HTTP responses in isolated databases. They do **not** prove a transfer through Paystack's actual sandbox.

The Paystack test key was not configured during implementation. The outstanding end-to-end sandbox check is documented in [T06 validation](../t06-validation.md). Human review is required before merging this money change. T07 has not started.
