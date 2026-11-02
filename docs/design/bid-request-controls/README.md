# Bid request control correction

Remove the decorative request surface and empty history wrapper. A new cancellation-review action appears only for an eligible owned live bid; it uses the shared filled red danger button. Persisted support conversations retain their status and View request action. Existing cancellable pre-bids retain their separate Cancel pre-bid action.

Focused verification: `node scripts/check-bid-cancellation-ui.mjs --controls-only`. Checks the danger button class, hidden ineligible request area, zero-size empty history wrappers, confirmation/retry, status updates, retained Bid now and no bid/payment writes at 360/768/1280. Changed-file lint, UI/web types and buyer build pass.

| State | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Eligible request | [Phone](commitment-360.png) | [Tablet](commitment-768.png) | [Desktop](commitment-1280.png) |
| Ineligible; no placeholder | [Phone](no-request-placeholder-360.png) | [Tablet](no-request-placeholder-768.png) | [Desktop](no-request-placeholder-1280.png) |

[Browser report](checks.json). Local buyer Docker updated. The cancellation-fee proposal is pending owner clarification and is not charged by this UI correction.
