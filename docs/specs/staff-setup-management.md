# Staff setup, account menu and activity history

Admin has `setup.manage` by default. Manager/Support defaults are unchanged; an administrator can explicitly delegate setup management through a custom role. Only an administrator with `records.purge` can permanently delete an unused archived category or pickup centre. Existing links and foreign-key history are never removed to permit a deletion.

## Management

Centre totals (2026-11-05): current uncollected stock and paid items pending collection update silently per centre; relisted stock is counted once and partial collections are handled at item level. The capacity field is explicitly a future booking setting. See [count definitions and checks](centre-live-counts.md).

Navigation amendment (2026-11-05): Categories and Pickup centres are reached through Inventory's Items/Categories/Pickup centres navigation, not separate sidebar entries. Inventory stays highlighted on all three pages. Each link retains its existing permission; a setup-only role can enter the group without gaining access to item records.

- **Categories:** create/edit name and unique URL slug; preserve an existing parent. The API also accepts an optional active parent and rejects category cycles. Active children must be archived before their parent.
- **Pickup centres:** name, unique uppercase code, public pickup address, opening-hours description in WAT and capacity per slot. Existing structured hours remain readable; new edits store the display description in `hours.display`.
- Both lists have search, Active/Archived filters, cursor pagination (max 50), silent refresh and loading/empty/error/offline/success states. Archive/restore changes selector availability without removing records from past lots. Ongoing auctions block archival; a centre with outstanding collections is also protected. New inventory cannot select an archived category or centre. Reference row locks serialize archival against intake.
- Saves and archive operations require an audit reason, idempotency key and optimistic timestamp for existing records. Concurrent stale edits fail rather than overwriting each other. Unique slugs/codes remain reserved for archived records. Delete first requires archival and relies on restrictive foreign keys to reject every remaining reference.

## Account controls

An initials avatar beside the bell contains Profile, Account security, Preferences and Sign out. Those links and the old personal block leave the sidebar. The menu supports keyboard focus, Escape and outside-click dismissal. Full names use first/last initials; a single name uses its first/last character.

Profile edits the account's display name through the existing authenticated profile API; email stays read-only. Security retains the existing independently controlled authenticator settings. Personal compact-table/reduced-motion preferences are persisted per account, audited, and do not affect another staff member or notification delivery. System reduced-motion settings still apply. The inventory description field is resizable and at least 240px tall.

## Audit history

Existing operational/security mutation audits remain intact. Setup changes add encrypted before/after snapshots with actor ID, action, record type/ID, reason and server timestamp in the transaction. Page navigation and account-panel visits are separately recorded; polling, token refresh and silent socket reconciliation do not create page-view noise. Existing successful sign-in/sign-out audits remain in the same log.

The audit list is newest first using `(created_at,id)` with a matching index and scoped cursors. Search covers actor name/ID, action and record ID. View changes shows staff identity, activity/record IDs, exact WAT date/time and redacted snapshots. Passwords, codes, keys, tokens, personal contact/address values and ciphertext are not exposed. Payment reconciliation uses its original encryption purpose. Audit access requires `audit.read`; the viewer cannot modify or delete audit history.

## API

All endpoints use current staff sessions, strict shared Zod contracts, permissions and existing mutation rate limits. They are typed in `packages/api-client/src/staff-admin.ts` and documented by Nest Swagger.

| Endpoint                    | Purpose                                                                   |
| --------------------------- | ------------------------------------------------------------------------- |
| `GET /staff/setup`          | `kind=category\|location`, active/archived view, search, cursor and limit |
| `POST /staff/setup`         | Discriminated category/centre save                                        |
| `POST /staff/setup/archive` | Archive, restore or protected permanent deletion                          |
| `GET /staff/preferences`    | Own display preferences                                                   |
| `POST /staff/preferences`   | Save own validated preferences                                            |
| `POST /staff/activity`      | Permission-checked page visit                                             |
| `GET /staff/audit/:id`      | Permission-checked redacted audit details                                 |

The additive migration retains every existing category/centre ID, unique key and foreign key. It adds archive/update metadata, category creation time, user display preferences and supporting indexes. The complete generated database dictionary describes every column, type, relation and constraint. No dependency, environment variable, financial calculation or bidding rule changes.

Verification: nine isolated setup/API/permission/idempotency/concurrency tests, twelve existing staff-administration regressions, affected type/lint checks, schema dictionary assertions and responsive browser checks at 360/768/1280. Screenshots use synthetic fixtures; see [review evidence](../design/staff-setup/README.md). Wider T15 warehouse throughput and R2 acceptance remain separate.
