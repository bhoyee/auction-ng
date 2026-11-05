# Staff collection history

Pickup desk now has Pickup queue and Collected items views. The latter shows one row per confirmed item: title, item reference, invoice reference, buyer, centre, WAT collection timestamp, handing-over staff and a green collected badge. Narrow screens stack rows; desktop uses a compact table. Existing handover state remains mounted while staff switch views.

Search filters while typing; pages contain ten items. Five-second visible-tab reconciliation and existing staff refresh signals retain confirmed rows during transient failures. Authorization failures clear protected results. Legacy handovers without staff/time details are labelled honestly, never backfilled with invented information.

Screenshots use synthetic fixtures:

- [360px](history-360.png)
- [768px](history-768.png)
- [1280px](history-1280.png)

Verification: 24 pickup integration tests pass against an isolated PostgreSQL database, including strict request validation, authentication/permission rejection, typed HTTP client, partial collection, legacy deduplication, search and stable cursor pagination. Four focused browser tests cover responsive layout, live search, pagination, empty results and retained content/error recovery. Affected lint/types and API/admin production builds pass. New indexes are applied through an additive migration. No payment, ledger or collection-execution rules changed.
