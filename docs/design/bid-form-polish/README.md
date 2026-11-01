# Bid form refinement

The two bidding methods share a row from 1100 px upward and remain stacked on smaller screens. Guidance uses compact yellow warning surfaces. Minimum next bid has a smaller bold label and a larger bold amount. The custom amount field and icon-led Bid now/Set limit button have equal-width columns, including on phones.

The amount input accepts plain digits and an optional decimal point with up to two decimal places, preserving the approved kobo bidding rule. Letters, signs, grouping separators, exponent notation and other symbols are rejected before they enter the field. This restriction is enabled only for this bid form; other NairaInput callers retain their existing behaviour.

The coloured total panel opens a read-only Estimated bid fees dialog from the same computed fee object used by confirmation. Opening it never prepares or confirms a bid. Bid now still opens the mandatory confirmation sheet. No fee arithmetic, bid minimum, wallet reservation or server acceptance rule changed.

Fee disclosure labels include the configured buyer premium and VAT percentages in both the details dialog and confirmation. Current defaults show Buyer premium (15%) and VAT on fees (7.5%), read from shared fee configuration. The details dialog explains the platform's auction service charge and that this VAT applies to premium plus lot fee. Labels/copy only; no rates or amounts changed.

The yellow, bold shortfall notice and filled Check wallet or add funds action appear only when the existing shortfall calculation reports insufficient funds. Balance reads reconcile on wallet-change events and tab focus without clearing the entered amount. Unknown balances keep bidding disabled; failed reads show a warning and an explicit retry. Successful balance refresh removes the funding prompt when funds cover the entered bid.

| State | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Bid full amount | [View](bid-entry-360.png) | [View](bid-entry-768.png) | [View](bid-entry-1280.png) |
| Automatic limit | [View](automatic-360.png) | [View](automatic-768.png) | [View](automatic-1280.png) |
| Insufficient funds | [View](insufficient-360.png) | [View](insufficient-768.png) | [View](insufficient-1280.png) |
| Fee details | [View](fee-details-360.png) | [View](fee-details-768.png) | [View](fee-details-1280.png) |
| Final review | [View](fee-review-360.png) | [View](fee-review-768.png) | [View](fee-review-1280.png) |

Focused `scripts/check-bid-entry-ui.mjs` checks invalid input rejection, default/radio selection, desktop radio alignment, 50/50 entry widths, fee-dialog disclosure without writes, dynamic insufficient/sufficient balances, balance failure/retry, immutable custom-amount submission and offline/live-price guards. [Results](review.json). Browser sessions, balances and bid responses are synthetic; no real bids, wallet postings or payments occur. Component captures hide fixed navigation, chat and the sticky bid bar so they do not obscure the form; these controls remain present and tested in the application.

Affected lint, formatting and shared UI types pass; buyer/admin production builds pass. Only the focused bid-form browser checks were run for this UI correction; unrelated full-site and financial integration suites were not rerun or weakened. Local web/admin Docker uses the updated builds.
