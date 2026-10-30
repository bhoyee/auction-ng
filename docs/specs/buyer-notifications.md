# Buyer transaction feedback and notifications

The in-app bell reads the existing `auction-result-v1` records. A unique
`purchase:{id}:paid` record is created by the existing purchase settlement
transaction; it appears as “Your Buy Now purchase is confirmed”. Other existing
auction-result records keep their result wording. No delivery payload is
decrypted or exposed. This change does not create financial notifications from
client claims or change payment/bid settlement.

- `GET /buyers/notifications?limit=10&cursor=…`: owned metadata, cursor pages
  bounded at fifty, now including nullable `readAt`. Destinations are the fixed
  `/invoices` or `/awaiting-pickup` routes.
- `GET /buyers/notifications/summary`: `{ unread, awaitingPickup }`. Pickup counts
  include only owned, paid, uncollected pickup orders in shared awaiting-pickup
  statuses. Delivery, cancelled, unpaid and collected orders are excluded.
- `POST /buyers/notifications/read`: strict `{ ids: UUID[] }`, one to fifty IDs.
  Returns `{ updated }`. Only owned result notices with `readAt=null` are updated.
  Retries are harmless; other buyers’ IDs are ignored. Email delivery state and
  encrypted payloads are unchanged.

All routes require the buyer role and return `Cache-Control: no-store`. The typed
client and Swagger metadata cover the new contracts. Migration
`20261030000200_notification_reads` adds `notifications.read_at` and indexes for
unread and pickup counts; existing notices initially remain unread.

The bell fetches on sign-in and reconciles silently every fifteen seconds while
visible/online, on focus and after purchase/wallet events. Failed reads omit the
count and offer Retry. Opening the bell refreshes it; opening a notice or using
Mark these as read acknowledges only the displayed IDs, leaving newer notices
unread. Reading a notice never changes an order or delivery status.

Buy Now and payment-return feedback uses server-confirmed results: green for a
paid purchase/credited wallet; indigo for pending payment or an expired purchase
whose payment became wallet credit; red for rejected, expired/cancelled or
unverified requests. Unknown results keep the same idempotency key and never
invite paying again. Owner/lot-scoped purchase snapshots prevent cross-account
receipt feedback. No fee, ledger, reservation or auction rules change.
