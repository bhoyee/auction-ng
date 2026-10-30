# Withdrawal bank search correction

The wallet bank picker now searches the complete provider bank directory as you
type. All cursor pages load automatically; there is no Load more banks action.
Refresh on opening, focus, reconnection and every minute while the form is open.
Background failures retain the last complete list and offer a red retry banner;
an incomplete first load is never presented as the full directory. Provider bank
changes are reflected after the next successful refresh, not a socket event.

The shared combobox supports touch/click selection, arrow keys, Enter and Escape.
Typing clears the previous bank code so a different typed bank cannot accidentally
submit the previous selection. Withdrawal errors use the existing solid red,
dismissible alert style. No payment, fee, verification or transfer rules change.

Run `node scripts/check-withdrawal-ui.mjs --bank-picker` against the local Docker
site. This focused fixture checks automatic pagination, bank-load failure/retry,
search/no matches, keyboard selection, directory refresh, red request-error feedback,
dismiss/retry and overflow at 360, 768 and 1280 px. It sends no real bank requests,
verification codes or money. Relevant lint/type checks and the web build also pass.

- [Phone search](search-360.png) · [Phone error](error-360.png)
- [Tablet search](search-768.png) · [Tablet error](error-768.png)
- [Desktop search](search-1280.png) · [Desktop error](error-1280.png)
