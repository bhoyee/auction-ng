# Pickup deadlines and storage review

Policy discovery correction (2026-11-06): Pickup desk → Deadlines & storage → Centre policy automatically selects the centre when only one exists. The prominent **Enable storage policy** checkbox is immediately visible, and its saved state remains shown after saving. It never enables itself. Targeted staff browser checks, lint/types and the admin production build pass. [360px](policy-360.png), [768px](policy-768.png), [1280px](policy-1280.png).

2026-11-06. Shared LotVanta typography/tokens, responsive item rows, distinct overdue status, tabular outstanding charges, explicit payment review and accessible shared dialogs. Staff controls remain inside Pickup desk; collection and storage views share its navigation.

Staff correction review: refreshed staff captures retain 360/768/1280 alignment. Storage notices have 44px dismiss controls with visible hover/focus. The readiness warning explains disabled policy and opens the explicit centre-policy setup. Browser checks cover dismissing a persistent action error during silent refresh and enabling the policy before a successful readiness retry. Product copy states that only paid auction wins/Buy Now pickups appear; unsold inventory is excluded.

Seven targeted Playwright checks pass: staff and buyer layouts at 360, 768 and 1280 px, plus adjustment errors remaining visible during silent refresh. They cover the protected staff pickup view and centre-policy dialog; owner buyer quote, explicit wallet confirmation and persistent success state. Screenshots use synthetic API fixtures, not proof of real provider settlement. Review captures show the list, not personal production data.

| Width | Staff | Buyer |
| --- | --- | --- |
| 360 | [Staff](staff-360.png) | [Buyer](buyer-360.png) |
| 768 | [Staff](staff-768.png) | [Buyer](buyer-768.png) |
| 1280 | [Staff](staff-1280.png) | [Buyer](buyer-1280.png) |

No horizontal overflow in the checked viewports. Mobile uses the same typed API and existing modal safe-area/keyboard components. Android and iOS production bundles pass; physical-device visual/payment-return review remains outstanding. No connected Android device was available for native screenshot review in this session.

**MONEY/BID CHANGE — needs human review.** Storage logic/provider tests are isolated and never call live Paystack. Centre policies remain off until configured; existing purchases do not receive backdated charges. Forfeiture/relisting remains blocked.
