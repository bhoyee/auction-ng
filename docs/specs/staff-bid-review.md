# Staff bid review

The Bid review page lets an administrator verify a buyer's claim of bidding on an item. It is a read-only inspection workflow with a separate `bids.read` capability. Administrators receive access by default; existing Manager/Support/custom-role permissions remain unchanged. An administrator can assign this capability without granting inventory editing, auction control or access to private buyer accounts.

## API

- `GET /staff/bid-review`: live search by item title/reference/UUID or bidder name/buyer UUID; optional status (`all`, `open`, `scheduled`, `closed`, `cancelled`), limit 1–50 (default 10), UUID cursor. Open includes closing items. Archived items remain searchable. Drafts and items without bids remain discoverable.
- `GET /staff/bid-review/:id`: item/schedule details, saved result, latest recorded current-round leader/price and a paginated history. Query: `view=bids|prebids`, bidder-name/UUID `search`, limit and UUID cursor.
- `POST /staff/bid-review/:id/open`: audit the inspection using a strict `{idempotencyKey: UUID}` body. Retry with the same key does not duplicate the audit event. Opening the item must succeed before its detail screen appears; background refresh does not repeatedly create inspection records.

All routes require authenticated staff/device credentials, current database-side `bids.read` authorization and a valid staff session. Return `Cache-Control: no-store`. Validate IDs/queries/bodies with shared strict Zod schemas and expose responses through the typed staff client and OpenAPI. Unknown fields, malformed cursors and excessive page sizes are rejected. UUID cursors must belong to the requested item for history. Order by creation time descending with UUID tie-breaker. Fixed-count bounded relation queries avoid per-row lookups. Indexes are added through `20261106000100_staff_bid_review`, which also extends the existing exact permission allowlist without granting access to other roles.

## Interpretation and privacy

Accepted requests and automatic counterbids appear separately with buyer name/UUID, event kind, acceptance reference, round and WAT timestamp. The lot's bid count counts submitted requests rather than generated counterbids. Earlier bidding rounds remain immutable history. The saved price following an event comes only from validated acceptance data; direct entered amounts may be shown. Never serialize private maxima, raw acceptance JSON, wallet/session identifiers, hashes, secrets, buyer emails or addresses. Legacy automatic rows without safe acceptance metadata show no amount.

Pre-bids show buyer identity, state and saved/update times; maxima remain hidden. A pre-bid record is not evidence of an accepted live bid until launch. The tab shows current persisted pre-bid records, not an invented revision history.

The result comes from the frozen lot settlement or a paid Buy Now purchase, never the largest historical bid. Keep frozen/payment-due/defaulted state and invoice payment status distinct. Label a confirmed paid auction result Winner, a frozen result buyer separately, and a Buy Now buyer Purchaser. For unsold or unavailable legacy results, do not invent a winner. The recorded current-round leader and latest price are historical database observations, not a live bidding quote. Null legacy metadata is labelled unavailable.

The page reconciles silently every five seconds while visible and on existing staff refresh/focus/online signals. Keep confirmed records during transient failures, clear protected data on authorization/not-found failures, ignore superseded responses and retain search focus while replacing result rows. Pages show ten rows locally, with server maximum 50. No ledger, bid acceptance, reservation, cancellation or settlement execution is changed.

## Targeted verification

`apps/api/tests/staff-bid-review.test.ts` covers archived/item/buyer search, cursor isolation and pagination, strict schemas, private-maximum exclusion, permission delegation, idempotent audit logging, frozen outcome semantics, typed HTTP access and unauthorized buyers. `tests/e2e/staff-bid-review.spec.ts` covers navigation permissions, bidder search/focus, pagination, pre-bids, retained content during failed refresh and responsive views. Screenshots and review are in `docs/design/staff-bid-review`.
