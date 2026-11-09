# Withdrawal popup and silent wallet refresh

2026-10-30. UI-only correction; no payment calculation or transfer behavior changes.

- Amount your bank receives uses the existing shared fixed Naira prefix outside the editable numeric value.
- Withdrawal status labels have smaller 12px text and compact coloured backgrounds. The containing receipt action preserves its 44px touch target and keyboard focus.
- Audited useWalletRead: balance, funding history, wallet activity and withdrawal history silently refresh every 15 seconds while visible and online, and on focus, reconnect and wallet-change events. Last confirmed data remains visible during updates/failures; owner/device/cursor fences prevent showing another account or page. Open processing receipts additionally poll every 5 seconds. These are periodic updates, not instant socket push.
- Targeted browser checks use the real polling timer with changed API fixtures: all three tables pick up changed values/status without page reload or manual refresh. Popup prefix survives clearing input; compact status appearance checked at each width.
- Changed-file lint, web/UI types and buyer production build pass.

| Width | Popup | Updated tables |
| --- | --- | --- |
| 360 | [View](popup-360.png) | [View](wallet-360.png) |
| 768 | [View](popup-768.png) | [View](wallet-768.png) |
| 1280 | [View](popup-1280.png) | [View](wallet-1280.png) |
