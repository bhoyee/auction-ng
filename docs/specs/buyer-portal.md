# Buyer portal

Authenticated buyer routes share the account sidebar on desktop and an expandable account menu below 1024 px. Public marketplace pages retain their existing shell. Refresh-cookie authentication and private route gates remain in place; account subtree state is keyed by buyer ID.

| Menu             | Route             | Source                                            |
| ---------------- | ----------------- | ------------------------------------------------- |
| Check-in         | /check-in         | Outstanding paid pickup orders; open private pass |
| Balance          | /wallet           | Existing wallet and funding services              |
| Awaiting pickup  | /awaiting-pickup  | Outstanding paid pickup orders                    |
| Shipments        | /shipments        | Delivery not yet available                        |
| Watchlist        | /watchlist        | Existing owned watchlist                          |
| Purchase history | /purchase-history | Completed Buy Now invoices                        |
| Bid history      | /my-bids          | Existing private bid activity                     |
| Profile          | /account          | Existing verified email/profile                   |
| Customer service | /customer-service | Configured email/WhatsApp and help links          |
| Logout           | action            | Revoke session and reload public marketplace      |

GET /buyers/purchases and GET /buyers/collections require buyer authentication, reject unknown parameters, accept limit (max 50) and cursor, and return the existing typed buyer invoice page. Responses use no-store. Cursor scopes bind both buyer and view; all database predicates include the authenticated owner. OpenAPI documents both endpoints, and packages/api-client exposes purchases()/collections(). No pickup token is returned by these lists.

Purchase history uses the linked Buy Now purchase record, keeping historical invoice status including refunds. Unpaid reservations and auction-only invoices are excluded. Collections require paid invoice, pickup fulfilment, pending/booked/ready status and null collectedAt. The additive invoices_buyer_status_history_idx supports the owner/status/date/id query; see database-schema.md for the full catalog.

Balance is one wallet: available is the prominent spendable amount, held is a smaller explanatory line, and total/available/held remain inspectable. No financial write paths or calculations changed. Existing bank-transfer and card funding remain available.

See ../design/buyer-portal/README.md for validation and responsive captures.
