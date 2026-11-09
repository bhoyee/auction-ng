# Pre-bid detail panel refinement

The scheduled-lot detail panel now matches the live auction price hierarchy: large indigo starting price, red computed retail-estimate discount, struck-through retail estimate and large labelled launch countdown. The displayed comparison uses the starting price; it is not a guaranteed final saving.

The private-limit field has an immutable naira prefix and accepts digits only. Its adjacent Review pre-bid button uses half the row; cancellation stays separate. A filled yellow Top up wallet action appears only when the typed limit plus disclosed fees exceeds available funds plus this lot's replaceable active reservation. Balance failures show retry feedback rather than assuming the buyer needs a top-up. Balances refresh silently on focus, reconnect, wallet changes and every five seconds. The server remains authoritative for funding and acceptance.

| Panel | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Saved pre-bid | [Phone](saved-detail-panel-360.png) | [Tablet](saved-detail-panel-768.png) | [Desktop](saved-detail-panel-1280.png) |
| Insufficient funds | [Phone](top-up-panel-360.png) | [Tablet](top-up-panel-768.png) | [Desktop](top-up-panel-1280.png) |

Verification: changed-file lint/formatting, UI/web types, buyer production build and `node scripts/check-upcoming-prebids-ui.mjs --detail-only`. [Browser report](checks.json). Uses synthetic browser authentication/responses against local demo SSR pages; no payment, reservation or backend rule was changed. Existing pre-bid save/edit/cancel and exact-retry interactions remain covered. Full-page screenshots are included alongside the panel captures.
