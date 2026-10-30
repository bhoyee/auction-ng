# Numeric funding input and verified checkout return

Owner correction, 2026-10-30. **MONEY/BID CHANGE — needs human review.** This changes checkout navigation and presentation, not fee calculation, credits, holds or settlement.

Wallet Amount to pay accepts ASCII digits only, including paste/input events. Reject an invalid edit as a whole, rather than stripping punctuation and silently changing an amount (for example 1.5 must never become 15). Clearing the field is allowed. Show the numeric phone keyboard and retain safe integer-kobo parsing and API validation. Other bid inputs keep their existing decimal behavior.

Previously initialization omitted `callback_url`; Paystack could display its success page without returning the buyer. Wallet and fixed-price hosted checkout now supply a server-owned URL:

```text
PAYMENT_RETURN_ORIGIN/payments/return?kind=wallet|purchase&id=INTERNAL_UUID
```

`PAYMENT_RETURN_ORIGIN` is a trusted buyer-site origin, not the webhook URL. It defaults to `http://localhost:3300` for this test-only local integration. Configure the HTTPS buyer origin on deployment. HTTP is allowed only for loopback; credentials, path, query and fragment in the origin are rejected. Return IDs are UUIDs. No client-supplied arbitrary destination is accepted. `pnpm paystack:local` injects both the test key and configured return origin from ignored `.env`, preserving demo database settings. Compose wires the same variable.

The protected return page preserves sign-in return routing, validates kind/UUID and calls the existing authenticated, owner-scoped card/purchase confirmation endpoint. Paystack's appended reference, trxref or success/status query claims do not establish success. Only API `credited` or `paid` results show confirmation. Pending, failure, expired/cancelled, loading, connection errors and explicit retry are supported. Successful wallet verification removes the matching pending-browser ID and invalidates wallet views. Return navigation cannot itself credit a wallet; the API still verifies Paystack and its immutable intent and shares idempotent credit with webhooks.

The webhook remains the public server-to-server URL ending `/payments/webhook`; it is separate from the buyer's browser callback. The webhook-only ngrok tunnel must not be used as the buyer origin because it blocks other routes. Localhost browser returns work on this PC; a phone/another device needs a reachable buyer-site origin.

Existing initialized checkout links retain their earlier provider settings. Already paid buyers should use Balance → Check pending payment and funding history, not pay again. New checkout links use the corrected callback. Real hosted redirect acceptance remains to be observed with a new test checkout; no payment was initiated during automated validation.

Validation: focused return-origin/provider/card/webhook tests and responsive browser checks. See [review and screenshots](../design/payment-return/README.md). Full-site and unrelated bidding suites are not required for this correction; CI remains unchanged. No dependencies, endpoints, database migrations or money-rule changes.

References: [Paystack hosted checkout and callback behavior](https://paystack.com/docs/payments/accept-payments/), [transaction initialization API](https://paystack.com/docs/api/transaction/).
