# Search contracts (T08)

Search uses the existing Meilisearch service through server-side `fetch`; no new external package or paid service is introduced. Product search screens remain in D01/T13/T14. The index is a rebuildable projection; PostgreSQL remains authoritative for visibility and catalogue fields.

## Public endpoint

`GET /search?q=iphnoe` returns the same typed catalogue page as `/lots`: `items`, `nextCursor`, `serverTime`. `q` is required, trimmed and limited to 120 characters. Supported filters are `categoryId`, `locationId`, `endingSoon`, `minPriceKobo`, `maxPriceKobo`, `limit` and `cursor`. Unknown/repeated query fields, raw Meilisearch filter expressions, fractional/unsafe kobo, reversed price ranges and malformed cursors are rejected. Each page defaults to 50 and cannot exceed 50. Price filters refer to starting prices. The endpoint is public, rate-limited per IP, returns `Cache-Control: no-store` and exposes no search credential.

Meilisearch handles text matching with all query terms required and typo tolerance enabled. Matches are ordered by **closing time then UUID**, like the catalogue. The sort ranking rule comes first so the cursor predicate is valid across every matching result; this is closing-time order, not a relevance-ranked feed. Meilisearch 1.23 supports UUID-string comparison filters. Cursor contents bind the `(endAtMs, id)` position to the normalized query/filter fingerprint. They are opaque position markers, not authentication tokens. There is no SQL text-search fallback or exposed offset. Editing closing times between pages may change ordering; this is not a frozen snapshot.

Only open/closing, unexpired lots are indexed. Scheduled/draft/cancelled/closed stock is excluded. Search asks Meilisearch for up to `limit + 1` ID/time hits, consumes one page and batch-loads the current public DTOs from PostgreSQL. That read rechecks status, time, category, location and price filters. A stale engine hit cannot expose a newly private or closed lot. The same four batched catalogue relation queries hydrate either one or 50 matching lots; the controller's IP limiter is a separate fixed query. Pending/unvalidated images, staff information, private storage keys, bidder identities and proxy maxima are never indexed or returned. Current bid prices remain null until T09/T11 provide live state.

A page can contain fewer items while the index catches up, including an empty page with a next cursor when its consumed engine hits have become ineligible. Follow the cursor to continue; start a fresh search to see newly indexed stock. An unavailable/unconfigured search engine returns an error rather than a successful empty result or stale cached prices. Search text is not written to analytics or application logs.

## Durable synchronization

The additive migration creates `search_index_jobs` and `search_index_revision_seq`. Every lot insert/update triggers an upsert in the same transaction. One row per lot coalesces changes, with a monotonically assigned `version`, an `applied_version` and update time. A rollback also rolls back that row change. A partial index covers pending rows. Existing lots receive pending jobs without any visibility change. All columns, types, relations, checks and indexes are in the generated database dictionary.

The existing BullMQ worker runs a search scheduler every two seconds. It calls the private `POST /internal/search/sync` endpoint with a dedicated random bearer credential; it never receives the database credential or Meilisearch master key. The endpoint is omitted from Swagger and rejects selectors/unknown body/query fields. `admin` permissions or buyer login do not grant this machine credential. Normal catalogue mutations still require their existing staff authorization and audit records.

The API takes a non-blocking PostgreSQL advisory lock, so only one sync batch can write the projection at a time. A busy invocation returns without competing. At most 50 pending lots are read per batch. Active lots are upserted; other statuses are removed. The index has explicit searchable/filterable/sortable attributes and displays only ID/closing-time fields to the API. No live payment or ledger path is involved.

Meilisearch writes are asynchronous tasks. The API polls a bounded interval and acknowledges a job only after the engine confirms success. Known pending task IDs are cached across retries so a slow batch is polled again instead of immediately submitted again. The cache has four fixed operation slots; an older write completes before newer content for that operation is submitted. Batches are serialized deterministically for stable retry fingerprints. After an API restart, replaying the same documents remains safe because document IDs are lot UUIDs. A failure leaves the durable row pending. Acknowledgement includes the exact version read; an edit committed while the engine works leaves the newer version pending. Worker retries use bounded exponential backoff and retain limited diagnostic job history. Logs contain no token, query text or provider payload.

The ten-second removal acceptance applies to a healthy local worker/engine and is tested against the **actual Meilisearch results**, not just the database gate. The API's database recheck excludes closed lots even during a search outage/backlog. Recovery from a wholly lost search volume requires a projection rebuild; automatic full disaster recovery and production backup operations remain T17. Durable pending changes survive normal worker/API restarts. No application data or search test indexes are reset/deleted by the tests.

## Configuration

- `MEILISEARCH_URL`: private engine origin; Docker uses `http://meilisearch:7700`.
- `MEILI_MASTER_KEY`: server-only key; never put it in web/mobile public variables.
- `MEILISEARCH_INDEX`: defaults to `auction_ng_open_lots_v1`. Tests use isolated `auction_ng_test_*` indexes and a new isolated PostgreSQL database.
- `SEARCH_SYNC_TOKEN`: API/worker-only credential of at least 32 characters. Generate it with `pnpm search:configure`; repeated runs preserve an existing token and all other credentials.
- `MEILI_MAX_INDEXING_THREADS` / `MEILI_MAX_INDEXING_MEMORY`: local/CI defaults are two threads and 256 MiB. These bound the engine's indexing resource budget on the shared host; they are not an exact process-memory cap.

All values are documented in `.env.example`. The worker does not schedule search until its sync credential is configured. Meilisearch remains bound to loopback on the Docker host. Do not expose its master key to the browser. The worker health check verifies that the search worker exists when configured.

## Verification

`pnpm test` runs the existing parallel functional suites, then a mandatory real-search phase against local PostgreSQL, Redis and Meilisearch, then the existing isolated catalogue performance gate. CI starts the pinned Meilisearch service and runs the same command. No acceptance limit is relaxed: closed-lot removal must remain below ten seconds and catalogue responses below 100 ms.

The tests prove typo matching (`iphnoe` → iPhone), equal-time keyset pagination without duplicates, catalogue filters, strict inputs, fixed query counts, stale-hit suppression, transactional outbox rollback, version-race handling, failed indexing retry, internal-route protection and actual BullMQ create/update/close propagation. Synthetic fixture lots stay in isolated test databases/indexes; no demo stock is published.

References: [Meilisearch string comparison filters](https://www.meilisearch.com/blog/meilisearch-1-15), [sorting and ranking](https://www.meilisearch.com/blog/the-art-of-sorting), [indexing resource options](https://github.com/meilisearch/meilisearch/blob/main/config.toml).
