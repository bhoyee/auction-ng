# Funding-history payment recovery

2026-10-31. Owner-approved UI correction.

Removed the standalone pending-payment button/dialog. Each pending hosted deposit has Check status and Cancel checkout in Funding history. Existing authenticated card/transfer confirmation endpoints verify the selected row, independently of browser checkout tracking. Feedback names the deposit amount; successful confirmation refreshes balance/history silently. Settled and cancelled rows do not expose these actions. Existing table pagination, horizontal scrolling on narrow screens and 15-second background updates remain.

## Validation

- Changed-file ESLint and Prettier pass; web TypeScript and production build pass.
- Focused mocked-browser checks at 360, 768 and 1280 px cover card/transfer endpoint and ID selection, unrelated browser storage, error/retry, pending and success feedback, protected settled rows and silent balance/history updates. No real payment is made by these checks.
- No unrelated full-site suite was run. Existing wallet-control/workspace and journey selectors were updated to reflect the new action.
- Backend money rules, fees, ledger and provider reconciliation are unchanged.

## Screenshots

| Width | Wallet | Error/retry | Confirmation |
| --- | --- | --- | --- |
| 360 | [Wallet](wallet-360.png) | [Error](error-360.png) | [Confirmed](confirmed-360.png) |
| 768 | [Wallet](wallet-768.png) | [Error](error-768.png) | [Confirmed](confirmed-768.png) |
| 1280 | [Wallet](wallet-1280.png) | [Error](error-1280.png) | [Confirmed](confirmed-1280.png) |

[Browser results](review.json). At narrow widths, scroll the funding table horizontally to reach Status/Action.
