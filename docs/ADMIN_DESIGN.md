# ADMIN_DESIGN.md — Staff dashboard design and patterns

Place this file at `docs/ADMIN_DESIGN.md`. Every agent building `apps/admin` reads it with `docs/DESIGN.md` (brand tokens) before writing UI code. Mockups of the key screens live in `docs/design/admin-*.png`.

The admin is a **work tool**, not a shop window. Staff use it all day: intake on a phone in the warehouse, finance at a desk, support with a buyer on the phone. Design goals, in order:

1. **Correct and trustworthy numbers.** Every figure has a definition (section 6), a time range, and a source a person can drill into.
2. **Fast to act.** The next action is always one click away: a lot to publish, a refund to approve, a pickup to hand over.
3. **Dense but calm.** More data per screen than the buyer site, the same brand, no decoration.
4. **Safe.** Money and destructive actions are confirmed, reasoned, permission-checked and audited.

---

## 1. Layout shell

```
+----------------------------------------------------------------------------------+
| [=] Auction NG Admin | Search lots, buyers, invoices…  (Ctrl K) | ● LIVE | 🔔 | AB |
+-----------+----------------------------------------------------------------------+
| Overview  |  Page title                          [Date range ▾] [Compare ▾] [⋯] |
| AUCTIONS  |  Breadcrumb / short description                                      |
|  Live     |  -------------------------------------------------------------------  |
|  Schedule |  KPI row (4–6 cards)                                                  |
|  Lots     |  Charts row (2/3 + 1/3)                                               |
|  Intake   |  Tables / work queues                                                 |
| ORDERS    |                                                                      |
|  Invoices |                                                                      |
|  Pickup   |                                                                      |
|  Delivery |                                                                      |
| …         |                                                                      |
+-----------+----------------------------------------------------------------------+
```

- **Sidebar (248 px, collapsible to 72 px icons):** dark indigo `#151A30` background, white text at 72% opacity, active item white with a 3 px yellow left marker and `indigo-700` background. Grouped by job (section 2). Badge counts on items that hold work (e.g. "Pickup 14", "Refunds 3"). Staff only see items their role allows; never show a link that leads to "Access denied".
- **Top bar (64 px, white, 1 px bottom border):** global search with `Ctrl/⌘ K` command palette (jump to a lot ID, invoice number, buyer phone, or an action like "Create lot"); a **live status pill** ("Live · 38 lots closing" yellow, or "No auction running" grey); notifications; environment badge on non-production (`STAGING` in amber so nobody refunds real money by mistake); user menu with role shown.
- **Page header:** title (24/30, 700), one-line description, and on the right the page's controls: date range, compare toggle, export, primary action button ("Create lot", "Record expense").
- **Content:** fluid width, max 1680 px, 24 px padding, 24 px gap between blocks, 16 px inside cards. Canvas `#F5F6F8`, cards white with 1 px `line` border, 12 px radius, no shadow.
- **Responsive:** 1280 px and up is the main target. 768–1279: sidebar collapses to icons, KPI row wraps to 2–3 per line. Below 768 only the **warehouse screens** (Intake, Pickup desk, Lot lookup) are fully supported as mobile layouts with large touch targets; other pages show tables as stacked cards.
- **Typography:** same family (Schibsted Grotesk). Table text 14 px, secondary 13 px, KPI value 28/32 700, tabular numbers everywhere a number appears.

## 2. Navigation map and who sees what

| Group     | Pages                                                                                  | admin | ops manager    | intake       | warehouse   | finance     | support             |
| --------- | -------------------------------------------------------------------------------------- | ----- | -------------- | ------------ | ----------- | ----------- | ------------------- |
| Overview  | Dashboard (role-specific, section 3)                                                   | ✓     | ✓              | ✓            | ✓           | ✓           | ✓                   |
| Auctions  | Live monitor · Lots · Intake · Inventory batches                                       | ✓     | ✓              | Lots, Intake | Lots (read) | Lots (read) | Lots (read)         |
| Orders    | Invoices · Pickup desk · Pickup slots · Deliveries                                     | ✓     | ✓              | —            | ✓           | Invoices    | Invoices (read)     |
| Buyers    | Buyers · Strikes and fraud flags                                                       | ✓     | ✓              | —            | lookup only | ✓           | ✓                   |
| Finance   | Revenue · Wallets and ledger · Top-ups · Refunds · Payouts · Expenses · Reconciliation | ✓     | Revenue (read) | —            | —           | ✓           | Refund request only |
| Support   | Tickets · Disputes · Canned replies                                                    | ✓     | ✓              | —            | —           | read        | ✓                   |
| Reports   | Sales · Inventory · Buyers · Finance · Operations · Scheduled reports                  | ✓     | ✓              | —            | —           | Finance     | —                   |
| Lot setup | Categories · Pickup locations · Conditions · Suppliers · Brands                        | ✓     | ✓              | read         | read        | read        | read                |
| Settings  | Staff and roles · Audit log · Fees and rules · Notifications                           | ✓     | —              | —            | —           | Fees (read) | —                   |

Rules:

- Permissions are **per action, not per page** (e.g. `refund.request`, `refund.approve`, `lot.publish`, `expense.create`, `user.suspend`). Roles are bundles of permissions; the matrix is editable in Settings › Staff and roles.
- The server enforces every permission; hiding a button is only a convenience.
- **Separation of duties:** the person who requests a refund, payout or expense above the threshold (default ₦50,000) cannot approve it. Approval needs a second user with `*.approve`.

## 3. Role-based home dashboards

Everyone lands on Overview, but its content depends on role. Each block is a reusable widget; the admin and ops manager see the full set.

| Role                | KPI row                                                                                    | Main blocks                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Admin / ops manager | Revenue · GMV · Lots sold · Sell-through · Active bidders · Pickup backlog                 | Revenue trend, Live right now, Category performance, Work queues, Recent activity |
| Intake              | Lots intaken today · Awaiting photos · Awaiting publish · Avg intake time                  | My queue (draft lots), intake by staff today, batches arriving                    |
| Warehouse           | Pickups booked today · Collected · Overdue (>5 days) · Forfeits due                        | Today's pickup slots timeline, overdue list, bin occupancy                        |
| Finance             | Net revenue · Wallet float · Top-ups today · Pending refunds · Unreconciled · Expenses MTD | Cash in vs out chart, approvals queue, reconciliation exceptions                  |
| Support             | Open tickets · Overdue SLA · Avg first response · Disputes open                            | Ticket queue, top reasons this week                                               |

### 3.1 Admin overview — section order (see `admin-overview.png`)

1. **Header:** "Good morning, Adaeze" + date range (default _Last 30 days_) + compare (_previous period_).
2. **Alert strip (only when needed):** red/amber banners for real problems, e.g. "Reconciliation: 3 top-ups not matched (₦142,500)", "Paystack webhook delays", "28 pickups overdue". Each has an action link. No strip when all is well.
3. **KPI row (6 cards):** Net revenue · GMV (hammer total) · Lots sold · Sell-through rate · Active bidders · Pickup backlog.
4. **Row 2 (2/3 + 1/3):** _Revenue and GMV trend_ (line chart with granularity switch Day / Week / Month) + _Live right now_ card (lots live, ending in the next hour, ending in the next 24 hours, bids per hour over the last 24 hours, link to Live monitor). Lots run continuously on their own countdowns, so there is no "tonight's auction".
5. **Row 3 (1/2 + 1/2):** _Sales by category_ (horizontal bar, sorted) + _Sales funnel_ (Lots listed → received a bid → sold → paid → collected, with drop-off %).
6. **Row 4 (1/3 + 1/3 + 1/3):** _Work queues_ (counts that need action: drafts to publish, refunds to approve, disputes, overdue pickups, flagged accounts) · _Top lots this period_ (table) · _Recent activity_ (audit feed).
7. **Row 5:** _Inventory health_ (stock by age band, value at cost) + _Expenses vs revenue_ (monthly bars).

## 4. Component patterns

### 4.1 KPI card

```
+----------------------------------+
| Net revenue              (i)  ⋯  |   label 13/600 slate, info tooltip = definition
| ₦18,420,500                      |   value 28/700 ink, tabular
| ▲ 12.4%  vs previous 30 days     |   delta: green ▲ / red ▼ + text, never colour alone
| ▁▂▃▂▄▅▄▆▇  (sparkline, 32 px)    |   same range as the card, no axes
+----------------------------------+
```

- Click opens the matching report pre-filtered to the same range.
- **Good direction is per metric:** revenue up = green; non-payment rate up = red; refunds up = red. Define it in the metric registry, not in the component.
- Show "—" with a tooltip when there is no comparable previous period. Never show "+∞%".
- Loading: skeleton of the same shape. Error: "Couldn't load · Retry" inside the card; the rest of the page still renders.
- Large numbers: full value on the card (₦18,420,500); compact form (₦18.4M) only on chart axes and sparklines.

### 4.2 Date range and comparison control

- Presets: Today · Yesterday · Last 7 days · Last 30 days · This week · This month · This quarter · This year · Last year · All time · Custom.
- Compare: None · Previous period · Same period last year.
- **Week starts Monday. All dates in Africa/Lagos (WAT).** "Today" means WAT midnight to now.
- The selected range lives in the URL (`?from=2026-10-01&to=2026-10-31&compare=prev`) so a link shared on WhatsApp opens the same view.
- One range per page, in the page header. Widgets that ignore it (e.g. "Live right now") say so in their subtitle.
- Granularity switch on trend charts: Day (ranges ≤ 92 days) · Week (≤ 2 years) · Month · Year. Disable grains that would make more than 400 points or fewer than 2.

### 4.3 Charts

Chart library: **Recharts** (React, SVG) for the admin only; add it via the dependency approval rule in AGENTS.md. Wrap it in `packages/ui/charts` so every chart shares tokens.

| Question                                  | Chart                                | Notes                                                                |
| ----------------------------------------- | ------------------------------------ | -------------------------------------------------------------------- |
| How did a number change over time?        | Line (2 px)                          | Current period solid indigo; comparison period dashed grey `#A3AAB8` |
| How much per day/week/month?              | Vertical bars                        | 4 px rounded tops, 2 px gap                                          |
| How does it break down over time?         | Stacked bars (max 4 parts + Other)   | e.g. revenue = premium + lot fees + delivery margin + storage fees   |
| Which category/staff/location is biggest? | Horizontal bars, sorted desc         | Labels left, value at bar end                                        |
| Where do we lose lots or buyers?          | Funnel (horizontal bars with % drop) |                                                                      |
| Share of a whole with 2–3 parts           | Single 100% bar                      | No pie or donut charts                                               |
| A single headline                         | KPI card / big number                | Not a chart                                                          |
| Activity by hour × weekday                | Heatmap, one hue (indigo light→dark) | Best time to close auctions                                          |

**Series colours (validated for colour-blind safety, fixed order, never cycled):**

| Slot       | Colour                         | Typical use                           |
| ---------- | ------------------------------ | ------------------------------------- |
| 1          | `#3B4FB8` indigo               | Main series (revenue, current period) |
| 2          | `#0FA38F` teal                 | Second series (GMV, lot fees)         |
| 3          | `#E8850C` amber                | Third series (delivery, storage)      |
| 4          | `#C2408A` magenta              | Fourth series                         |
| Comparison | `#A3AAB8` grey, dashed         | Previous period                       |
| Status     | green `#127A55`, red `#C8341C` | Good/bad only, always with icon/text  |

Rules: one y-axis per chart (never dual axes); legend for 2+ series plus direct labels on ≤ 4 lines; recessive grid (1 px `#EEF0F3`, horizontal only); axis labels 12 px slate with compact Naira (₦1.2M); every chart has a hover tooltip (crosshair on lines) showing exact values and the comparison delta; every chart has a "View as table" toggle and CSV export in its `⋯` menu; empty state "No sales in this range" instead of a flat zero line; charts never animate on load.

### 4.4 Data tables (the most used component)

```
[Saved views: All · Live · Unsold · Needs photos ▾]  [Search in lots…]  [Filters (3)] [Columns] [Density] [Export]
+---+---------+------------------------------+-----------+---------+---------+----------+----------+-----+
| ☐ | Lot ID  | Item                         | Category  | Status  | Current | Retail   | Ends     |  ⋯  |
+---+---------+------------------------------+-----------+---------+---------+----------+----------+-----+
| ☐ | L-20431 | [img] Tecno Camon 30, 256GB  | Phones    | ● Live  | ₦86,000 | ₦215,000 | 02:14    |  ⋯  |
+---+---------+------------------------------+-----------+---------+---------+----------+----------+-----+
 3 selected: [Publish] [Move to auction ▾] [Print labels] [Archive]              1–50 of 2,184  ‹ ›
```

- Sticky header; first column (ID) and actions column sticky on horizontal scroll.
- Numbers right-aligned, tabular; text left-aligned; status as badge (4.6).
- Filters open in a panel; active filters show as removable chips above the table. Filter state is in the URL.
- **Saved views** per user and shared team views ("Needs photos", "Unpaid > 24h").
- Density: Comfortable (52 px rows) / Compact (40 px). Default compact for finance and audit.
- Bulk actions appear in a bar only when rows are selected; destructive bulk actions need confirmation with the count ("Archive 12 lots?").
- Server-side sorting, filtering and cursor pagination (50 rows default, 100 max). Export runs as a background job for more than 5,000 rows and emails/notifies a download link.
- Row click opens the **detail drawer** (4.5); Ctrl/⌘-click opens the full page in a new tab.
- Empty: explain why and offer the next action ("No lots need photos. Intake new stock"). No-results from filters: "No lots match these filters · Clear filters".

### 4.5 Detail drawer and detail page

- Drawer slides in from the right (560 px), keeps the table visible, has Prev/Next to move through rows, and a "Open full page" link.
- Full detail page layout: header (title, ID with copy button, status badge, primary actions) → summary cards → tabs → right rail with key facts.
- **Every entity page has an Activity tab** showing its audit history (who changed what, when, before → after).
- Internal notes on lots, buyers, invoices and tickets, with @mentions of staff.

### 4.6 Status badges (one map, used everywhere)

| Entity                    | Statuses and colours                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lot                       | Draft (grey) · Ready (indigo-50) · Scheduled to publish (indigo outline) · Live (yellow, pulsing dot) · Sold (green) · Unsold (grey) · Relisted (indigo outline) · Archived (grey outline) |
| Invoice                   | Unpaid (amber) · Paid (green) · Overdue (red) · Refunded (grey) · Partially refunded (amber outline) · Void (grey outline)                                                                 |
| Pickup                    | Awaiting booking (amber) · Booked (indigo) · Ready on shelf (indigo-50) · Collected (green) · Overdue (red) · Forfeited (grey)                                                             |
| Delivery                  | Quoted · Booked · Picked up by courier · In transit · Delivered (green) · Failed (red) · Returned                                                                                          |
| Refund / payout / expense | Requested (amber) · Approved (indigo) · Paid (green) · Rejected (red outline)                                                                                                              |
| Ticket                    | New (indigo) · Open · Waiting on buyer (grey) · Resolved (green) · SLA breached (red)                                                                                                      |
| Buyer                     | Active · Unverified (amber) · Flagged (red outline) · Suspended (red)                                                                                                                      |

Badges: 12 px/600 text, 4 px radius, dot + label, never colour alone.

### 4.7 Forms and actions

- Labels above fields, help text under, inline validation. Money inputs in Naira with thousands separators, stored as kobo.
- **Money and destructive actions** use a confirm dialog that restates the effect in plain words ("Refund ₦23,000 to Chiamaka Obi's wallet for invoice INV-88213"), requires a **reason** (dropdown + note) and, above the threshold, routes to approval instead of executing.
- Optimistic UI only for safe actions (add note, watch). Money actions show a progress state and the server result.
- Toast on success with an Undo where the action is reversible within 10 seconds (archive, unpublish); never for money.

### 4.8 Work queue widget

A compact list of "things that need someone": icon, label, count, oldest item age, link. Sorted by urgency (SLA breach first). Counts are live (refresh every 30 s or via socket). Zero states collapse to "All clear".

### 4.9 Activity feed

Time-ordered list from the audit log: avatar/initials, actor, verb, object link, time ago ("Tunde refunded ₦23,000 on INV-88213 · 4 min ago"). Filter by actor/type. Used on Overview, entity Activity tabs and the Audit log page.

## 5. Module patterns

Each module lists: purpose · list view · detail view · key actions · analytics.

### 5.1 Live monitor (Auctions › Live)

- **Purpose:** watch every live lot in real time and react. Lots end around the clock, so this page is useful at any hour.
- **Layout:** live header (lots open, closing next 15 min, bids/min, GMV so far, connected buyers) → "Closing next" table updating over the socket (lot, current bid, bids, leader masked, watchers, time left with yellow under 2 min) → right rail: bids-per-minute line (last 60 min), soft-close extensions count, error feed (failed holds, rejected bids).
- **Actions:** pause a lot (with reason, audited), extend end time, cancel a lot (refunds holds automatically), message all bidders on a lot.
- **Analytics:** bids per minute, extensions, peak concurrent viewers.

### 5.2 Lots list (Auctions › Lots) — publishing lives here

> **Built 2026-11-13 (T15e) with owner changes:** no review step yet (no Waiting review/Ready statuses, "Drafts to finish" card), random `LOT-` IDs, supplier instead of batch until Inventory batches, labels and exports without new libraries, and run time locks from scheduling. See `docs/decisions.md` (2026-11-13, Lots inventory).

There is **no separate publish page and no auction events**. Each lot runs on its own countdown: `startAt = publishedAt`, `endAt = startAt + runTime`. Everything (create, review, publish, schedule, bulk publish) happens from Lots. Mockup: `docs/design/admin-lots.png`.

- **Header:** title, total, buttons "Import CSV" and "Create lot".
- **Status tabs with counts:** All · Drafts · Waiting review · Ready · Scheduled · Live · Ending in 24 h · Sold · Unsold · Archived. The tab with work waiting for this user (e.g. Waiting review for a manager) is highlighted. Tabs are saved views; users can add their own (e.g. Needs photos, Relist candidates).
- **Filters:** search (title, ID, bin), category, hub, condition, run time, intake by, date. Active filters show as removable chips.
- **Columns:** checkbox · Lot (thumbnail, title, `ID · category · condition`) · Hub · bin · Status badge · Run time · Timing · Start price · Current bid / bids · Watching · Retail est. · By (intake staff) · ⋯ menu.
  - **Timing** depends on status: Live → countdown (turns danfo yellow under 1 h) + "ends Sat 9:40pm"; Scheduled → "Starts Fri 8:00pm" + "ends Sat 8:00am"; Draft/Review/Ready → run time chosen, "not started"; Sold/Unsold → "Ended Thu 7:12pm" + hammer or "no bids".
  - Columns can be hidden; the choice is saved per user.
- **Statuses:** `draft` (intake still working) → `review` (submitted, waiting for a manager) → `ready` (approved, not yet live) → `scheduled` (publish time set) → `live` → `sold` / `unsold` → `archived`. Also `paused` and `cancelled` from the Live monitor. A manager can send a lot in review back to `draft` with a note.
- **Bulk bar** (when rows are selected): "Publish…" (yellow, opens the publish panel), Change run time, Print labels, Archive. Actions that do not apply to some selected lots say how many will be skipped and why.
- **Row ⋯ menu:** Open, Edit, Publish now / Schedule, Duplicate, Print label (QR with lot ID + bin), Relist with a new run time (unsold only), Archive. Live lots link to the Live monitor actions (pause, extend, cancel).
- **View a lot** (mockup `admin-lot-view.png`): header with status, ID, category path, location and bin; buttons Print label, Duplicate, Edit, Open in Live monitor, ⋯. Yellow notice when bids lock price and run time. Gallery + description + custom fields; tabs Bids (full names for admin/ops, masked name shown alongside) · Watchers · Details · Activity · Invoice and pickup; right column: current-bid card, lot journey timeline, quick actions.
- **Delete rules** (mockup `admin-lot-actions.png`), always a soft delete with a reason, restorable by an admin for 30 days: Draft / Waiting review / Ready → delete · Scheduled → delete (scheduled publish cancelled) · Live without bids → cancel first · Live with bids → never, cancel only (holds refunded) · Sold or unsold → archive only. Admin and ops manager delete; intake only their own drafts. The ⋯ menu hides actions the user can't take.
- **Duplicate** copies all fields except photos, bin and history into a new draft. **Archive** hides ended lots from lists but keeps them searchable and in reports.
- **Bulk publish panel** (right drawer, 520 px; mockup `admin-lot-publish.png`): selected lots as chips · run time for all (presets) or "Use each lot's suggestion" · start Now / Schedule · "Spread starts over N hours" · end range preview in WAT · mini chart of endings per hour for the next 72 h (live lots vs this batch) with the busiest hour marked · quiet-hours (1am–6am) warning with a one-click fix · buyer notification toggles with audience counts · list of lots that will be skipped (e.g. fewer than 3 photos) · footer "Publish N lots now" / "Schedule N lots". Warnings never block.
- **Staff notifications (bell in the top bar, on every admin page):** unread count; panel with filter chips All / Lots / Money / Buyers; "Mark all read"; each item has an icon, one-line message, time, action link and unread dot. Lot events: lots submitted for review, lot sent back to you, scheduled publish went live, lots could not be published (with reason), lots ending in 1 h with no bids, lot ended unsold, unpaid invoice after 24 h. Users choose in Notification settings which events also go to email/SMS. Notifications respect permissions (intake staff only see their own lots).

### 5.3 Create or review a lot (Auctions › Lots › New / L-xxxxx)

One form is used for create, edit and review. Mockup: `docs/design/admin-lot-create.png`. Two columns: form on the left, sticky right rail.

- **Photos:** up to 12, drag to reorder, first is the cover, tag photos that show a defect. At least 3 photos to publish.
- **Item details:** title, category, subcategory, condition (New · Like new · Open box · Damaged · Untested, as cards), description, "What's included" tags, "Missing or defects" tags (shown in red to buyers).
- **Price:** start price, retail estimate (shows expected recovery hint), optional reserve (admin only).
- **Location and source:** hub, bin, batch, unit cost (finance/admin only).
- **Right rail — Run time and publishing:** run time presets 12 / 24 / 36 / 48 / 72 h or custom 1 h – 7 days (default from Fees and rules, with a suggestion based on retail value); start: Publish now · Schedule… · Keep as draft; live end-time preview in WAT; quiet-hours warning; note "Run time locks after the first bid".
  - Buttons by role: **intake** sees "Save as draft" and "Submit for review"; **ops manager / admin** see "Publish now" (or "Schedule"), "Save changes" and, when reviewing, "Send back to <name>" with a required note.
- **Right rail — Buyer notifications:** toggles "Tell interested buyers" (followers of the category + matching saved searches, with counts; bundled so a buyer gets at most one "new lots" message per 15 minutes) and "Show in New today". Automatic (not toggles, listed for clarity): watchers get "ending in 1 h" and "ending in 10 min"; bidders get "outbid" instantly; the winner gets "You won" with total and pickup details; bidders and watchers are told if the lot is paused, extended, corrected or cancelled; the seller side gets nothing.
- **Right rail — Ready to publish? checklist:** photos ≥ 3, title and category set, start price set, bin set, plus warnings (e.g. a similar lot is already live). Hard rules block publishing; warnings don't.
- **Right rail — How buyers will see it:** live preview of the lot card.
- **Detail page after publishing** adds: price and bid history (full names visible to admin, masked elsewhere), watchers, invoice link, pickup status, Activity tab (every change, by whom, when).
- **Rules:** run time and start price can change only while the lot has no bids; every publish, schedule, send-back and edit is audited.

### 5.4 Intake (Auctions › Intake) — mobile first

- Step flow on a phone: scan/assign batch → take photos (camera, 3–8, auto-compress) → title (suggestions from past lots), category, condition grade with plain definitions, retail estimate, start price (default from rules), bin location → save as draft or ready. Large 56 px buttons, works one-handed, offline queue with retry.
- Desktop view: bulk CSV import with column mapping, validation report and row-level errors.
- **Analytics:** lots per staff per hour, average intake time, rejected/returned lots.

### 5.5 Inventory batches (Auctions › Inventory)

- **Purpose:** track the stock you buy, so margins are real.
- A **batch** = a purchase from a supplier (supplier, date, cost, number of items, category mix, invoice upload). Lots link to their batch.
- **List columns:** batch, supplier, received, cost, items, intaken %, sold %, revenue so far, margin so far, age.
- **Detail:** recovery chart (cumulative revenue vs cost over days since receipt — the day it crosses cost is break-even), lots table, unsold aging.
- **Inventory health widget:** units and cost value by age band (0–7, 8–30, 31–60, 60+ days), and sell-through by category. Items unsold after 2 relists flagged for bundle/pallet or write-off.

### 5.6 Invoices (Orders › Invoices)

- List: invoice no., buyer, lots count, hammer, premium, fees, VAT, total, status, paid at, pickup status.
- Detail: line items with fee breakdown, payment record (ledger entries), pickup/delivery, refund history, PDF download.
- Actions: request refund (full/partial, per line), mark dispute, resend invoice.

### 5.7 Pickup desk (Orders › Pickup) — tablet/phone first

- Full-screen scanner view: big "Scan pickup pass" camera area, manual search by invoice/phone as fallback.
- After scan: buyer name and photo of ID check prompt, list of lots with photo, bin location and a checkbox per item, "Mark all collected" button, issue button ("Item missing", "Damaged") that opens a ticket.
- Side list: today's booked slots by hour, arrivals, overdue.
- **Analytics:** pickups per hour, average handover time, overdue count, forfeits.

### 5.8 Deliveries (Orders › Deliveries, phase 2)

- Table of shipments with courier, tracking, status timeline, cost vs charged (margin), failed deliveries queue.

### 5.9 Buyers (Buyers)

- **List:** name, phone (masked unless permission), joined, verified, wallet balance, lots won, total spent, last active, strikes, status.
- **Detail (360° view):** profile and KYC status (BVN masked) → wallet (balance, held, ledger) → bids and wins → invoices → pickups → tickets → strikes and flags → notes → Activity.
- **Actions:** add strike / remove strike (reason), suspend/reactivate, reset bidding limit, send message. All audited.
- **Fraud flags view:** accounts sharing device/BVN/bank, rapid top-up-and-withdraw, shill-bid patterns (staff/supplier links), with "Dismiss" or "Suspend" and a required note.
- **Analytics:** new vs returning bidders, cohort retention (monthly), top buyers, reseller segment (≥ N wins/month), non-payment rate by cohort.

### 5.10 Finance (Finance)

Finance is split so each page answers one question.

- **Revenue:** net revenue and its parts (premium, lot fees, delivery margin, storage fees) as stacked monthly bars; GMV trend; revenue by category and location; VAT collected (for filing).
- **Wallets and ledger:** total **wallet float** (customer money held — a liability, not revenue), held vs available, ledger explorer (filter by type, wallet, reference). Read-only: ledger entries are never edited.
- **Top-ups:** incoming transfers with provider reference, bank, status, matched/unmatched.
- **Refunds and payouts:** request → approve → paid workflow, approval queue with requester, reason, amount, age; threshold rules visible.
- **Expenses:** record expenses with category (Rent, Salaries, Logistics, Marketing, Utilities and diesel, Packaging, Software, Bank and payment fees, Stock purchase is NOT an expense here — it lives in Inventory batches), amount, date, vendor, payment method, receipt upload, approver. Monthly budget per category with progress bars (actual vs budget, red when over).
- **Profit and loss (simple):** for a month/quarter/year: Revenue (hammer + premium + fees) − Cost of stock sold (from batches) = Gross profit; − Expenses = Operating profit. Show it as a table with % of revenue and a comparison column; not a full accounting system — export to the accountant.
- **Reconciliation:** daily match of Paystack settlements and transactions vs ledger; exceptions list (in Paystack not in ledger, in ledger not in Paystack, amount mismatch) with resolve actions and notes. A day is "closed" only when exceptions are zero or explained.
- **Rule:** finance figures come from the ledger and invoice tables only, never from the bid engine.

### 5.11 Support (Support)

- Ticket inbox: three-pane layout (queue list · conversation · buyer context with their recent invoices, wallet and pickups). Channels: in-app, email, WhatsApp (phase 2).
- Fields: category (Payment/top-up, Item condition, Pickup, Delivery, Account, Refund), priority, assignee, SLA timer (first response 2 h, resolution 48 h in business hours).
- Disputes: linked to invoice/lot, evidence photos, decision (refund full/partial, reject) which triggers the refund workflow.
- **Analytics:** volume by category per week, first response time, resolution time, CSAT (phase 2), top reasons with trend.

### 5.12 Reports

- Pre-built reports, each a full page with filters, chart and table: **Sales** (daily/weekly/monthly/yearly GMV, revenue, lots sold, average hammer, % of retail), **Auctions** (sell-through, bids per lot, extensions, best close times heatmap), **Inventory** (aging, batch recovery, category mix), **Buyers** (acquisition, retention cohorts, top buyers, non-payment), **Finance** (P&L, expenses vs budget, VAT, float), **Operations** (intake throughput, pickup times, overdue, staff productivity), **Support**.
- Every report: date range, compare, granularity, group-by (category, location, staff, source), CSV/XLSX export, "Schedule this report" (daily/weekly/monthly email to chosen staff).
- "All time" view available on every report, with yearly granularity by default.

### 5.13 Staff and roles (Settings)

- Staff list: name, email/phone, role(s), location, 2FA status, last login, status. Invite by email; deactivate (never delete — audit history must keep the name).
- Roles page: permission matrix (rows = permissions grouped by module, columns = roles, checkboxes). Built-in roles cannot be deleted; custom roles can be added. Changing a role requires a reason and is audited.
- Security: 2FA required for all staff; sessions list with "Sign out everywhere"; IP and device on each login.

### 5.14 Audit log (Settings)

- Append-only table: time (WAT), actor, role, action, entity (link), summary, IP, device. Filters: actor, action type, entity, date. Row expands to a **before → after diff** of changed fields.
- Money actions, permission changes, exports of personal data and log-ins are always logged. The audit log itself cannot be edited or deleted by anyone in the UI. Export requires `audit.export`.

### 5.15 Settings — rules, fees, locations

- Fees and rules: buyer premium, lot fee, VAT rate, increments table, default run time and allowed run-time presets, soft-close window, storage days and fee, strike limits, refund approval threshold. Every change shows "applies from" date/time, needs a reason, and keeps history (past invoices keep the rules they were created with).
- Locations: hubs with address, hours, slot capacity, bins.

### 5.16 Lot setup (Lot setup › Categories, Pickup locations, Conditions, Suppliers, Brands)

Everything a lot depends on. Must exist before lots can be created. Mockups: `admin-categories.png`, `admin-locations.png`. All pages share one tab bar with counts.

- **Categories:** two-panel page. Left: searchable, drag-to-order tree (2 levels) with lot and live counts. Right: Basics (name, web address, parent, description, icon) · Defaults for new lots (run time, lowest start price, photos needed, conditions allowed) · "Item details staff must fill in" (custom fields: name, type text / list / number / yes-no, options, required, shown to buyers, drag order) · stats (live lots, sell-through, average % of retail). Subcategories inherit fields and defaults. Delete only when empty; otherwise "Move lots" or "Hide from buyers".
- **Pickup locations:** list of location cards (code, address, status Open / Opening on date / Closed, lots, pickups today, % bins used) + editor: details and map pin · opening hours · pickup rules (free days, storage fee per day, slot length, buyers per slot, ID required, delivery from hub) · bins (summary + Manage bins) · staff assigned. Close instead of delete once it has held lots.
- **Bins** (per location, mockup `admin-bins.png`): kept simple, a bin is a named spot (S-01, CAGE-1, FLOOR) with an optional note and limit. Table with lots inside and status; add one bin or several by name + number range; delete only when empty, otherwise "Not for new lots"; QR label per bin; bin is optional unless "Bin must be set before publishing" is on.
- **Conditions:** New, Like new, Open box, Damaged, Untested, each with buyer-facing meaning and order.
- **Suppliers:** name, type, contact, terms, batches, total spent; deactivate, never delete if it has batches.
- **Brands:** name + categories; merge duplicates.
- **Rules:** admin and ops manager edit; other roles read only. Every change audited. Changes apply to new lots only.

## 6. Metric definitions (the single source of truth)

Implement these once in `packages/shared/src/metrics.ts` (definitions, good direction, format) and compute them in the aggregates (section 7). The info tooltip on every KPI shows this definition.

| Metric                   | Definition                                                                                            | Good |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | ---- |
| GMV                      | Sum of hammer prices of lots **sold** in the period (by close time)                                   | ▲    |
| Net revenue              | Buyer premium + lot fees + storage fees + delivery margin, excluding VAT, minus refunds of those fees | ▲    |
| Gross sales value        | Hammer + premium + fees (what buyers were invoiced, excl. VAT)                                        | ▲    |
| Lots listed              | Lots that went live in the period                                                                     | ▲    |
| Lots sold                | Lots closed with a winning bid                                                                        | ▲    |
| Sell-through rate        | Lots sold ÷ lots closed                                                                               | ▲    |
| Average hammer           | GMV ÷ lots sold                                                                                       | ▲    |
| Recovery rate            | GMV ÷ sum of retail estimate of sold lots                                                             | ▲    |
| Bids per lot             | Accepted bids ÷ lots closed                                                                           | ▲    |
| Active bidders           | Distinct buyers who placed ≥ 1 bid in the period                                                      | ▲    |
| New buyers               | Buyers whose first bid was in the period                                                              | ▲    |
| Non-payment rate         | Invoices unpaid after 24 h ÷ invoices issued                                                          | ▼    |
| Collection rate (5 days) | Pickups collected within 5 days ÷ pickups due                                                         | ▲    |
| Pickup backlog           | Paid lots not yet collected (now)                                                                     | ▼    |
| Wallet float             | Sum of all wallet balances (available + held) at a point in time                                      | info |
| Top-ups                  | Sum of credited top-ups in the period                                                                 | ▲    |
| Refunds                  | Sum refunded in the period (to wallet or bank)                                                        | ▼    |
| Cost of stock sold       | Batch cost allocated to lots sold (batch cost ÷ items in batch, or per-lot cost if entered)           | info |
| Gross profit             | GMV + net revenue − cost of stock sold                                                                | ▲    |
| Operating profit         | Gross profit − expenses                                                                               | ▲    |
| Inventory value          | Cost value of lots not yet sold                                                                       | info |
| Inventory age            | Days since lot intake, for unsold lots                                                                | ▼    |
| Intake rate              | Lots intaken per staff hour                                                                           | ▲    |
| First response time      | Median time from ticket creation to first staff reply (business hours)                                | ▼    |

Period rules: a sale belongs to the day its lot **closed** (WAT); a payment to the day it was **credited**; an expense to its **expense date**. Deltas compare equal-length periods.

## 7. Data and performance rules

- **Never compute dashboards from hot tables at request time.** A worker job maintains aggregate tables:
  - `metrics_daily` (date, location_id, category_id, metric columns) updated every 5 minutes for today and nightly for yesterday (late events, refunds).
  - Weekly/monthly/yearly views roll up from `metrics_daily`; "All time" reads monthly rows.
  - `live_auction_stats` in Redis for the Live monitor and "Live right now" card (pushed over the socket).
- Admin APIs read from a **read replica** when one exists; the bid engine and ledger are never queried by dashboards.
- Overview loads in < 1.5 s with 12 widgets: one batched request for KPIs, one per chart, each widget loads independently with its own skeleton.
- Tables: server-side filter/sort/paginate with indexes for every saved view's filter.
- Exports run as background jobs; files are stored for 7 days; downloading is audited.
- Numbers on screen and in exports must match: both use `metrics.ts` and the same aggregates.

## 8. Visual rules specific to the admin

- Same tokens as DESIGN.md. Yellow is still only for live/urgent; amber `#E8850C` is for warnings in admin (pending, overdue soon).
- KPI cards, chart cards and tables share one card style; vary emphasis with size and position, not colour.
- No illustrations, no gradients, no shadows except menus, drawers and dialogs.
- Every number has a unit and a period ("₦18.4M · last 30 days").
- Dark sidebar, light content. Dark mode for content: phase 2 (tokens ready).
- Print styles for invoices, pickup lists and the P&L.

## 9. States checklist for every admin screen

Loading skeleton · empty (with next action) · no results (clear filters) · error per widget with retry · permission denied (hidden from nav, explained if reached by link) · offline (warehouse screens queue actions) · stale data notice when aggregates are behind ("Updated 6 min ago").
