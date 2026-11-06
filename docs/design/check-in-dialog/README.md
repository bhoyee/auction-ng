# Buyer check-in popup

Overview and Pickup desk share a yellow Check in a buyer heading action, visible only with pickup.manage. It opens the same accessible dialog for arrival-code entry or supported camera scanning. The old beside-queue panel is removed; the queue fills the page width.

Closing the popup restores trigger focus and does not register arrival. While a scan is being submitted, repeated submission and dismissal are blocked. Errors stay inside the dialog; successful registration opens that buyer's existing collection checklist and refreshes the queue. Check-in does not collect items. Existing backend permissions, scan handling and handover confirmations are unchanged.

Synthetic preview screenshots:

| Width | Popup | Pickup queue |
| --- | --- | --- |
| 360 | [View](popup-360.png) | [View](queue-360.png) |
| 768 | [View](popup-768.png) | [View](queue-768.png) |
| 1280 | [View](popup-1280.png) | [View](queue-1280.png) |

Five focused check-in browser checks and four collection-history regressions pass. Checks cover both entry points, permission hiding, Escape/focus return, invalid-pass recovery, successful registration/checklist routing and responsive bounds. Affected lint/types and admin production build pass. No unrelated money/bid suites rerun.
