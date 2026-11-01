# Receipt fee percentages

Auction receipts show the agreed Service charge and VAT percentages alongside the existing amounts, in HTML and plain text. Rates come from the auction's immutable fee policy. Disabled charges show an effective 0%; Buy Now keeps its separate item-tax label. No amounts are recalculated for email display.

Queued auction receipts without the new rate snapshot resolve their original settlement policy during delivery. They never read today's current marketplace rates.

Synthetic receipt previews, visually reviewed for legibility and layout:

- [360 px](receipt-360.png)
- [768 px](receipt-768.png)
- [1280 px](receipt-1280.png)

Targeted tests cover configured/default/zero rates, escaping, template generation, plain-text output, Buy Now tax, old/new locked auction policies and queued receipt compatibility. The receipt delivery test checks percentages in local Mailpit and keeps private pickup-pass information out of email.
