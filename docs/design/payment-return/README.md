# Payment return and numeric input review — 2026-10-30

Funding simplification follow-up: remove the reusable/personal bank-account panel, BVN/setup form and account-status fetch from Balance. Keep one-time transfer, Nigerian/international cards and historical personal-account receipts. The updated targeted browser check asserts no personal-account UI or API reads, all three funding choices, retained historical receipts during delayed refresh, and the existing verified checkout/refresh/status behavior at 360/768/1280. Web lint/types and production build pass. Financial APIs/data were not changed; the earlier 47-test financial result below is retained historical evidence, not a new full-suite run for this UI-only correction.

Wallet transfer/status follow-up: one-time hosted transfer quote/acceptance/navigation, large check/cross status headings, filled indigo return action, bank codes containing letters and a fifteen-second silent wallet refresh. Updated browser checks retain input and loaded panels through delayed requests, retain the page with a stale-data notice on failure, recover without flashing, and observe a timer-driven balance update without manual refresh. All three widths passed. Captures and review.json below reflect this update, including failed-360/768/1280.png.

The expanded focused suite has 47 passing tests, including five concurrent transfer initialization retries, ten webhook duplicates plus confirmation, verified mismatch rejection, typed HTTP endpoints and reconciliation. The real Paystack TEST bank adapter loaded fifty records after fixing alphanumeric-code validation. An additive constraint migration preserves existing intent immutability and net-amount guards. [Current contracts](../../specs/wallet-transfer-checkout.md). Actual hosted transfer payment acceptance remains pending; no live payments were made.

| Width | Wallet amount | Verified return |
| --- | --- | --- |
| 360 px | [Wallet](wallet-360.png) | [Return](confirmed-360.png) |
| 768 px | [Wallet](wallet-768.png) | [Return](confirmed-768.png) |
| 1280 px | [Wallet](wallet-1280.png) | [Return](confirmed-1280.png) |

Captures use isolated browser fixtures; displayed balances and verification states are not real payment activity. No Paystack payment was initiated by these checks.

`node scripts/check-payment-return-ui.mjs` passed at all three widths: reject typed letters/special characters and mixed paste, allow digits/clearing, preserve integer-kobo quote input, ignore URL success/reference claims, show server-returned pending/failed/credited states, reject malformed IDs without a confirmation request, verify purchase returns, and avoid overflow/browser errors. [Results](review.json).

Focused tests: 34 passed across return-origin safety, Paystack provider payloads, existing card funding/confirmation and webhook handling. Includes five simultaneous initialization retries, ten duplicate card events, triple bank-webhook delivery, owner-bound verification and immutable amount/fee checks. New assertions cover the callback payload and owned payment UUID. Relevant API/web/root/UI type checks, targeted ESLint/Prettier and API/web production builds passed. Unrelated full-site and bidding suites were not rerun. No tests or CI requirements were weakened.

Visual review: existing Auction NG type/tokens/components, clear payment-status heading, restrained success feedback, readable recovery instructions and 44 px controls at phone/tablet/desktop widths. No image assets or layout redesign were introduced.

The API and buyer Docker preview are updated. Actual Paystack redirect acceptance still needs a new hosted test checkout. Existing paid transactions should be checked through Balance, never paid again. [Contracts and configuration](../../specs/payment-return.md). **MONEY/BID CHANGE — needs human review.**
