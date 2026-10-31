# Check-in availability correction

The sidebar no longer offers Check-in because the arrival endpoint and staff queue do not exist. The protected legacy URL has a clear online-check-in-unavailable notice, in-person collection guidance and a link to Awaiting pickup. It does not list invoices, fetch collection orders or claim an arrival was registered. Sidebar collapse still works; My account replaces the previous yellow action.

## Validation

Targeted lint/formatting, web/UI types and buyer production build pass. Focused browser checks at 360/768/1280px verify no Check-in navigation, no invoice listing/fetch on the legacy page, working navigation to paid pickup orders and desktop collapse/expand. No unrelated full-site suite or money logic changed.

| Width | Legacy route | Account navigation |
| --- | --- | --- |
| 360 | [Notice](check-in-360.png) | [Account](account-menu-360.png) |
| 768 | [Notice](check-in-768.png) | [Account](account-menu-768.png) |
| 1280 | [Notice](check-in-1280.png) | [Account](account-menu-1280.png) |

[Results](review.json). Arrival registration and the staff queue remain future work.
