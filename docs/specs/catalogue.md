# Catalogue and image contracts (T07)

T07 supplies backend contracts for web, admin and mobile. Product screens remain in D01/T13/T14/T15. Search indexing is T08; this module does not call Meilisearch or accept text-search queries.

## Public catalogue

| Method and path   | Contract                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `GET /lots`       | `categoryId`, `locationId`, `endingSoon`, `minPriceKobo`, `maxPriceKobo`, `limit`, `cursor` |
| `GET /lots/:id`   | Public detail including description and completed image derivatives                         |
| `GET /categories` | Cursor-paginated categories, including parent IDs                                           |
| `GET /locations`  | Cursor-paginated pickup location IDs, codes and names                                       |

Every list defaults to 50 and rejects limits outside 1–50. Unknown fields, repeated query parameters, unsafe/fractional kobo and malformed or filter-mismatched cursors return 400. Lot ordering is `(end_at ASC, id ASC)` with a strict keyset predicate, including UUID tie-breaking for equal closing times. Category/location ordering uses unique slug/code followed by ID. Cursors are opaque position markers, not authorization tokens. Each page rechecks public visibility; inserts or changed end times between pages can change the catalogue and are not a snapshot guarantee.

Lists show scheduled, open and closing lots with end times in the future. `endingSoon=true` narrows this to open/closing lots ending within one hour according to server time. Detail also permits closed lots. Draft/cancelled lots return 404. Prices filter the **starting price**, not the live bid price. `currentPriceKobo` stays null and `priceSource` is `unavailable` until T09/T11 supply live state. Never render the starting price as a confirmed live bid. Lot responses use `Cache-Control: no-store` for now and include `serverTime`; edge catalogue caching remains a buyer-app concern once live-price separation exists.

Prisma batches lot/category/location/image reads into a fixed four SQL queries for either one or 50 lots. Lists fetch at most 51 lots to detect a next page, at most 20 images per lot, and omit legacy placeholder images without generated metadata. Category/location summaries omit internal fields. The additive starting-price index complements the existing status/end/category/location indexes. This is catalogue SQL, not the live bid path.

## Staff draft intake

| Method and path                                          | Contract                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| `POST /admin/lots`                                       | Create a draft from `createLotInputSchema`                   |
| `GET /admin/lots/:id`                                    | Read a draft and its `updatedAt` version                     |
| `PATCH /admin/lots/:id`                                  | Partial edit with mandatory `expectedUpdatedAt`              |
| `POST /admin/lots/:id/images/uploads`                    | Request a private, checksum-bound upload                     |
| `POST /admin/lots/:id/images/uploads/:uploadId/complete` | Validate the uploaded file and publish generated derivatives |

All routes require an active `admin` or `intake` account, the existing authentication and role guards, an installation UUID and per-user/IP limits. Every successful staff operation writes encrypted audit metadata in the same database transaction as its database changes, including draft reads. Writes check role/status again at the service boundary. Other roles cannot mutate catalogue records.

**Staff SSO/MFA is not configured yet.** The existing buyer email-code path intentionally cannot authenticate staff. These endpoints fail closed in the local product; no test login, role-changing endpoint, shared admin token or fallback was added. Tests substitute identities only inside the test process to exercise HTTP permissions and contracts. Real staff onboarding remains a prerequisite to operational intake.

Only draft lots may be edited or receive images. Row locks and optimistic versions prevent lost updates; duplicate lot numbers return 409. Category/location references and start/end order are validated. There is no publishing, scheduling, cancellation, live-price update or settlement endpoint in this task. No ledger or bid operation changes.

## Images

The source file is never accepted as a public URL. The request contains a UUID idempotency key, exact byte length (up to 8 MiB), lowercase SHA-256 hex, JPEG/PNG/WebP MIME and an unused position 0–19. Under the lot lock, an upload intent binds the actor, lot, file digest, size, MIME, expiry and position. Identical retries reuse the intent; a changed payload cannot reuse its key. Active intents reserve positions. A new intent is needed after expiry.

The API signs a PUT for at most five minutes to a **private incoming bucket**. The signature binds content length, MIME and `x-amz-meta-sha256`, containing the accepted lowercase hex digest. R2's full-object SHA-256 checksum mode is unsupported, so this uses signed metadata and the API independently hashes the stored bytes during completion. Metadata alone is never proof of file integrity. Upload clients must send the returned headers and exact bytes to that URL. Presigned URLs are bearer credentials; do not log them or send them to analytics. Browser uploads require bucket CORS. They use the R2 S3 endpoint, not the public custom domain.

Completion checks actor/lot ownership, expiry, bytes and SHA-256, then decodes the actual photo. Corrupt files, MIME mismatch, animations, SVG and images above 20 megapixels are rejected. Sharp rotates from EXIF, strips metadata and generates WebP at maximum dimensions 320 and 960 without enlargement. Thumbnail quality is reduced within a bounded set until its file is at most **30,000 bytes**; a file that cannot meet the limit is rejected. At most two photos are processed concurrently per API process; busy requests return 503 for retry. This is bounded intake processing, not work on the latency-sensitive bid path.

Only generated derivatives go into a separate public bucket, under server-generated immutable object paths, with `image/webp` and a one-year immutable cache policy. A final transaction rechecks role and draft status, inserts the completed image and audit record, and marks the intent ready. Completion retries return the same image without duplicate rows or audit records. A storage failure can leave unreferenced derivatives; it never exposes the original through the API or attaches an unvalidated image. Incoming originals require an R2 lifecycle expiry policy; no automatic deletion of repository or application data is performed by this task.

Public image DTOs contain display/thumbnail URLs, dimensions, byte count and sort order. They never contain the original object key, uploader identity, signed PUT URL or checksum. Shared contracts are in `packages/shared/src/catalogue-schemas.ts`; typed clients are in `packages/api-client/src/catalogue.ts`; all routes are described in Swagger at `/docs`.

## R2 configuration and acceptance

Uploads remain disabled without R2 settings. Configure credentials only in the ignored `.env` or deployment secrets; never commit or paste them into chat.

1. Create separate incoming/private and derivatives/public R2 buckets. Keep public access disabled on the incoming bucket. Add a lifecycle rule for incoming objects after the operational retention period.
2. Restrict a scoped R2 API credential to the two buckets. Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_UPLOAD_BUCKET`, `R2_PUBLIC_BUCKET` and `R2_PUBLIC_URL`. The last value is an HTTPS custom-domain origin with no path.
3. On the incoming bucket, allow CORS `PUT` from the exact admin origin, with `Content-Type` and `x-amz-meta-sha256` allowed. The browser supplies content length; native clients must send the exact file length. Do not use wildcard production origins.
4. Restart the API. After staff SSO/MFA is configured, create a draft, request an upload, PUT exact bytes with the returned headers, then complete the owned intent.
5. Fetch the public thumbnail URL. Verify status 200, `Content-Type: image/webp`, cache policy and body length ≤30,000 bytes. Verify the original is inaccessible publicly and completion retries create only one image. Test an expired URL, wrong checksum, MIME mismatch and a buyer attempting upload.

Provider acceptance is pending until real R2 buckets/credentials and staff authentication are available. The automated suite exercises actual WebP generation and presigning with synthetic credentials plus an in-memory storage boundary; it does not claim a real Cloudflare upload was performed.

References: [Cloudflare presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [R2 checksum compatibility](https://developers.cloudflare.com/r2/api/s3/api/), [R2 browser CORS](https://developers.cloudflare.com/r2/buckets/cors/), [Sharp input limits](https://sharp.pixelplumbing.com/api-constructor/).
