# Staff notifications and live dashboard

The staff bell shows an authenticated, cursor-paginated inbox and unread count. Notifications are visible only to their recipient while that recipient retains the event's required capability. Opening or marking an alert read does not approve a request, move money, or suppress its email. Email queued/sent/failed status comes from the existing delivery outbox.

## Events and audiences

| Committed event                             | Required capability  | Action                               |
| ------------------------------------------- | -------------------- | ------------------------------------ |
| Withdrawal enters review                    | `withdrawals.manage` | Finance → Withdrawals                |
| Buyer consents to a bid-cancellation review | `bids.cancel`        | Open the linked support conversation |
| Buyer requests human support                | `support.manage`     | Open the linked conversation         |
| Buyer replies in human support              | `support.manage`     | Open the linked conversation         |
| Paid auction win or completed Buy Now order | `auctions.manage`    | Auctions                             |

Guided FAQ chat does not email staff until human support is requested. Completed-sale notifications are generated from a paid invoice, never a currently-leading bid or an unverified checkout. Existing buyer win/outbid email and in-app notifications remain separate. The inbox includes email delivery state without exposing message contents, bank details or buyer email addresses in staff alerts.

Custom roles must also retain the read permission needed by an alert's existing destination: `finance.read` for withdrawal reviews, `support.manage` for bid-cancellation conversations, and `inventory.read` for Auctions. Filter both inbox and email when either required capability is absent; notifications never grant extra access.

## Durability and realtime

Additive PostgreSQL triggers append minimal source event IDs within the originating transaction. A rollback creates no event. Existing closing/support workers process bounded batches after commit, select eligible active staff by their current capabilities, and insert one encrypted notification per event/recipient with a unique reference. Source-key uniqueness and row locking protect concurrent retries. Staff enrolling after an event are excluded from that event's audience. Outstanding withdrawal/cancellation reviews are seeded during rollout.

Redis/Socket.IO sends content-free staff invalidations to recipient user rooms or all authenticated staff workspaces. The browser silently reloads the inbox, metrics and paginated data; five-second visible-tab polling and focus/online refresh reconcile lost signals. Retain confirmed data during temporary failures; never blank the page on each update. Network delivery is outside the source operation. Email uses existing SMTP/Resend configuration, with staff links based on `STAFF_WEB_ORIGINS`; sending rechecks current staff permissions.

## Contracts

- `GET /staff/notifications?limit=20&cursor=…`: max 50 entries, opaque user/permission-scoped cursor, unread count, server time, email delivery state.
- `POST /staff/notifications/read`: strict `{ids: UUID[]}` with 1–50 IDs; only owned, currently permitted alerts are updated. Retries are harmless and actual changes are audited.
- Socket event `staff:changed`: no private payload. Refresh through authenticated REST endpoints.

No new dependency or environment variable. Full end-to-end verification must distinguish mocked email delivery from actual SMTP delivery to a real configured staff account.

Staff email is drained by the existing five-second support delivery worker, keeping additional staff SMTP traffic out of the auction-closing email batch. The closing worker may still fan out durable events and publish invalidations promptly. Local email preview is labelled explicitly in the inbox; a saved Mailpit preview is never presented as a real external delivery. Each staff alert records the mode actually used for sending, so switching providers does not relabel historical previews as delivered email.
