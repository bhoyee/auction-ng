# Wallet funding field and badge correction

2026-10-30. Owner-requested UI-only correction.

- Cancelled withdrawal statuses use the red danger badge.
- Card methods use compact slate-grey badges; one-time transfers use yellow, keeping green for credited status. Method badges remain non-interactive.
- Amount to Fund has a fixed Naira prefix outside the editable value. Clearing or replacing the numeric value cannot remove the currency symbol. Existing numeric validation and payment calculations are unchanged.
- Targeted web/UI type checks, changed-file lint and buyer production build; browser checks at 360, 768 and 1280 px, including full-row selection, fixed-prefix persistence and cancelled status colour. No unrelated suites run.

| Width | Wallet | Cancelled status |
| --- | --- | --- |
| 360 | [View](wallet-360.png) | [View](cancelled-360.png) |
| 768 | [View](wallet-768.png) | [View](cancelled-768.png) |
| 1280 | [View](wallet-1280.png) | [View](cancelled-1280.png) |
