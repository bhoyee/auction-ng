# Wallet cancellation and polish

2026-10-30. Targeted review against DESIGN.md. Synthetic browser fixtures; no real payout or personal data.

- Cancel is offered only before approval (draft/review), with confirmation, green success and red approval-race feedback. Approved rows remain protected.
- Cancellation retains history, releases held funds once and charges no fees. Concurrent approval or confirmation cannot release approved funds.
- Payment methods use compact non-interactive neutral, green and yellow badges. Full-row clicks and native radio selection both work.
- Removed the requested explanatory sentences; minimum and daily limit use small corner badges. Tables retain horizontal scrolling on narrow screens.
- 22 withdrawal integration/concurrency tests and 13 focused policy/email tests pass. Relevant lint/types and production builds pass.

| Width | Wallet | Approval race | Cancelled |
| --- | --- | --- | --- |
| 360 | [View](wallet-360.png) | [View](race-360.png) | [View](cancelled-360.png) |
| 768 | [View](wallet-768.png) | [View](race-768.png) | [View](cancelled-768.png) |
| 1280 | [View](wallet-1280.png) | [View](race-1280.png) | [View](cancelled-1280.png) |

MONEY/BID CHANGE ? needs human review. Production withdrawal activation remains subject to the existing provider acceptance and launch gates.
