# Incoming pre-bid history

Web layout checks use synthetic authenticated API responses against the locally built website. These are UI fixtures, not buyer orders or submitted payments. Incoming remains reachable when the live-bid list is empty. Page overflow checks pass at all three widths.

| State | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Incoming | [Phone](incoming-360.png) | [Tablet](incoming-768.png) | [Desktop](incoming-1280.png) |
| Cancelled pre-bids empty | [Phone](cancelled-empty-360.png) | [Tablet](cancelled-empty-768.png) | [Desktop](cancelled-empty-1280.png) |

Mobile passes lint, TypeScript and Android bundling; native screenshots and physical-phone visual review remain pending. Web screenshots do not stand in for native verification.
