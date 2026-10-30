# Public lot result

`GET /lots/:id/result` is public, validates the UUID and rejects unknown query
fields. It returns `Cache-Control: no-store` and the shared strict contract:

```ts
{
  lotId: string;
  state: 'open' | 'closing' | 'sold' | 'unsold' | 'closed';
  finalPriceKobo: number | null;
  serverTime: string;
}
```

Sold requires a closed lot with a paid invoice line; the public final price is
its hammer/item price, never a private spending limit or the invoice fee total.
Unpaid invoices never produce Sold. Settlement metadata distinguishes unsold
and still-confirming closures. Open lots stay open even if an earlier database
deadline has elapsed; the live engine owns soft-close extensions.

Only public catalogue statuses are readable. Delivery payloads, buyer/winner IDs,
invoice IDs, private limits and settlement snapshots are never returned. Reads
use existing lot/settlement primary keys and the unique invoice-line lot index.
No schema migration, new dependency, bid or money mutation is introduced.

The item detail receives the initial catalogue status and reconciles this result
every five seconds while visible/online, plus focus/online/wallet invalidations.
A closed initial status immediately suppresses bidding. Confirmed sold/unsold
results stop polling and remain readable without live Redis state. A clock alone
cannot fabricate closure or a winner; genuine open-auction connection errors
retain the existing stale-price protections. The typed client uses a five-second
timeout and Swagger documents the endpoint.
