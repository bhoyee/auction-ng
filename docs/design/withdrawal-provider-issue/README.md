# Withdrawal provider-access rejection

2026-10-31. MONEY/BID CHANGE - needs human review.

The actual local test request returned HTTP 400, code transfer_unavailable, because the Paystack account is a Starter Business. Read-only verification returned Transfer not found. This was not a bank processing delay or LotVanta finance approval. No live endpoint credentials were used.

The Paystack adapter now classifies only that known rejection using a safe typed error. The worker stores processingIssue=provider_account on the existing pending request. History shows a compact red Payment service unavailable status; the receipt explains the transfer-access setup blocker and that funds remain reserved. Raw provider messages, keys and bank details are not exposed. Unknown errors and ambiguous timeouts remain subject to normal reconciliation.

No refund, forced success or new transfer reference is introduced. When a matching verified transfer becomes available, the issue clears and existing idempotent settlement applies. Actual sandbox success remains blocked by provider account access; the owner requested only correction of the misleading status while using this account.

Validation: 15 Paystack adapter tests and 23 isolated withdrawal integration/concurrency tests; changed-file lint, API/web types and API/worker/web builds. Browser fixtures check the red blocker, explanation and silent recovery at 360/768/1280 px. Recovery screenshots simulate a provider result; they do not establish an actual Paystack payout.

| Width | Blocked explanation | Simulated verified recovery |
| --- | --- | --- |
| 360 | [View](blocked-360.png) | [View](recovered-360.png) |
| 768 | [View](blocked-768.png) | [View](recovered-768.png) |
| 1280 | [View](blocked-1280.png) | [View](recovered-1280.png) |
