# Buyer check-in and staff arrivals

Buyer: /check-in. Staff: admin homepage, Pickup arrivals, authorised warehouse/admin staff only. Paid pickup orders can register arrival once, then staff acknowledge and close the visit independently of goods collection. Buyer and staff views silently refresh every fifteen seconds.

Nine isolated database/API integration tests, focused lint/types and API/web/admin builds pass. Browser checks use synthetic buyer/warehouse identities and mocked arrivals; they exercise the full UI flow without moving money or collecting goods. No unrelated full-site suite was run.

| Width | Choose order | Checked in | Staff queue | Acknowledged |
| --- | --- | --- | --- | --- |
| 360 | [Buyer](buyer-360.png) | [Arrival](checked-in-360.png) | [Staff](staff-360.png) | [Status](acknowledged-360.png) |
| 768 | [Buyer](buyer-768.png) | [Arrival](checked-in-768.png) | [Staff](staff-768.png) | [Status](acknowledged-768.png) |
| 1280 | [Buyer](buyer-1280.png) | [Arrival](checked-in-1280.png) | [Staff](staff-1280.png) | [Status](acknowledged-1280.png) |

[Results](review.json) - [Contract and limits](../../specs/pickup-check-in.md). No geolocation proof, waiting-time guarantee or collection confirmation is implied.
