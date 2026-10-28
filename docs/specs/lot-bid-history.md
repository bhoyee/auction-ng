# Lot bid-history endpoints

`GET /lots/:id/bid-history?limit=20&cursor=...` is public. It returns the existing strict `LotBidHistory` schema: `items` with bid row ID, recorded leading `currentPriceKobo`, lot-scoped `bidderLabel`, UTC `createdAt`, plus `nextCursor`. It never returns request amounts, automatic limits, account IDs, names or contact details. Missing/non-public lots return 404; unknown query keys, invalid UUIDs/cursors and limits outside 1�50 return 400. Use `createCatalogueClient().lotHistory()`.

`GET /buyers/lots/:id/my-bids?limit=20&cursor=...` requires the existing buyer bearer token and device ID. It returns the existing `BuyerBidPage` for the authenticated owner and specified item only; no user ID can be supplied. Cursors are scoped to that owner and item. Use `createBuyerClient().lotBids()`. Guest requests return 401; staff cannot use the buyer route. Existing account-wide bid history remains unchanged.

Both responses use `Cache-Control: no-store` and are described in generated OpenAPI. Lists use a bounded fixed query count with a composite `(user_id, lot_id, created_at, id)` index for personal history. Public history uses the existing `(lot_id, created_at, id)` index. The original authenticated public-history route remains compatible.

The UI treats recorded history as asynchronous evidence, separate from the current Socket.IO price. The latest recorded leader highlight does not declare an auction winner. This is a read-only change; bid acceptance and money movement are unchanged.
