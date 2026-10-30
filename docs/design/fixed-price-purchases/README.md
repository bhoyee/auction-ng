# Buyer fixed-price purchase review

At 360/768/1280 px, `signed-out-*` shows the item/tax quote and sign-in action; `card-quote-*` shows disclosed processing charges; `reservation-*` shows hosted-transfer checkout and its deadline; `paid-*` shows the completed wallet purchase.

The browser checks use the real local production website, real API authentication and an isolated database/provider fixture. They verify reservation creation, cancellation, one wallet charge/invoice and no browser errors or horizontal overflow. No real demo buyer is charged. `review.json` records the results.

`cancelled-bids-*` shows retained bid history after the fixed-price sale; `invoice-*` shows the fixed item price and item tax without auction fees. The 360 px run also checks that insufficient wallet funds let the buyer choose another payment method immediately after the rejected debit.

The [actual demo card captures](../card-image-timer/README.md) include yellow trophy/Naira badges under the condition badges. These prices come from the catalogue, not a guessed display value. The existing blue/red segmented timers are preserved.
