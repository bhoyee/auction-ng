# Deposit cancellation review

2026-10-31. **MONEY/BID CHANGE — needs human review**

Synthetic browser fixtures, no real deposit or bank data modified. Uses existing shared buttons, dialogs, toast feedback, tables and brand tokens. Full row/table scrolling is retained on small screens.

Cancel checkout appears only on hosted pending deposits. Confirmation explains the local closure and late-credit policy. Keep checkout dismisses without action. A simulated network error shows red feedback; retry uses the same payment ID. Success closes the dialog, shows a red Cancelled badge and clears matching local tracking without changing balance. A simulated later verified payment appears as Credited and updates the wallet through normal silent polling. Return-page copy identifies Checkout cancelled instead of a generic failed payment.

| Width | Confirmation | Error | Cancelled history | Return page | Simulated late credit |
| --- | --- | --- | --- | --- | --- |
| 360 | [View](confirmation-360.png) | [View](error-360.png) | [View](cancelled-360.png) | [View](return-360.png) | [View](late-credit-360.png) |
| 768 | [View](confirmation-768.png) | [View](error-768.png) | [View](cancelled-768.png) | [View](return-768.png) | [View](late-credit-768.png) |
| 1280 | [View](confirmation-1280.png) | [View](error-1280.png) | [View](cancelled-1280.png) | [View](return-1280.png) | [View](late-credit-1280.png) |

16 targeted funding integration/concurrency tests, changed-file lint, relevant types and API/worker/web builds pass. [Contract](../../specs/deposit-cancellation.md).
