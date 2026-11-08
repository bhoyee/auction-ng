# Live monitor lot actions

Owner request: 2026-11-08. Brand: LotVanta.

**MONEY/BID CHANGE — needs human review.** Whole-lot cancellation is distinct from buyer-consented paid bid cancellation. No buyer cancellation fee applies. Bid records are retained; cancelled auctions declare no winner and never auto-relist.

The Closing next action trigger opens an anchored keyboard-operable menu. View bid history opens the Bids drawer, with 25-row cursor pages and WAT timestamps. Any currently authorised monitor reader may inspect it without entering a reason. Administrator full-name responses commit an audit record before returning; other readers receive masked names. Automatic private limits are never disclosed, including to administrators. The earlier reasoned-history endpoint remains for compatibility; the new drawer supersedes that UI rule.

Open lot opens the staff workspace with photos, item details, original duration, current deadline and paginated change history. Batch and cost are explicitly unavailable until their actual records exist; no synthetic values are substituted. Access independently requires inventory.read.

Correction messages use the existing encrypted durable outbox and in-app/email/enabled-device push pipeline. The bounded recipient cursor now unions bidders and current watchers existing at the cutoff, deduplicating buyers who belong to both groups. Marketing is prohibited in the action's copy and staff reason/audit. Message delivery retains the approved local-email-preview behaviour.

Administrators and operations managers with auctions.manage may extend, pause, resume or cancel an open, unsold lot. Other roles do not see these actions. The server independently verifies current role, permission and staff session before committing each request. Extensions offer exactly 2 minutes, 10 minutes, 30 minutes or 1 hour, from one shared list used by the form, input validation and Lua allowlist. Pauses freeze time and preserve reservations; resume restores the frozen remaining duration. A global pause must finish before an individual control can start. Global restoration skips individually frozen books rather than adding overlapping pause time twice.

Every modifying action requires a reason and an idempotency key. Cancellation additionally requires a reason category and note. Pause/cancel in the final 120 seconds require a second typed confirmation, checked again by the atomic script using server time. A stale accepted-stream revision cannot be used for an action. Closed/paid/settled stock cannot be revived or cancelled. Existing checkout reservations take precedence: individual controls reject while one is active, preserving reconciliation rules.

## Durable operation

1. Commit the permission-checked encrypted request and staff audit.
2. Atomically validate the current book and acquire a permanent per-lot Redis fence. Capture the contiguous accepted-stream barrier, frozen time and planned deadline. Competing bids, new purchases, buyer cancellation approvals and closing cannot pass the fence.
3. Persist accepted events through that barrier. Commit the lot's durable status/deadline and an encrypted before/after action audit. Cancellation first makes the database lot terminal; bid preparation also locks the lot row, so a concurrent preparation cannot create a reservation after the terminal scan.
4. For cancellation, release every remaining active bid hold through LedgerService with stable per-intent release keys, in bounded batches. Retrying after interruption cannot release twice. Preserve all history and original run time.
5. Apply the matching Redis receipt, enqueue one recipient outbox job, remove the fence and mark the command complete. Resume additionally finalises its clock, synchronises SQL while still fenced and refuses to open if finalisation is more than one second old. Interrupted attempts repeat clock finalisation rather than consuming frozen time. The existing private monitor worker retries interrupted commands. Live projections and buyer sockets resynchronise without navigation or reload.

The new journal is included in guarded offline recovery checks and fingerprints. Completed extension/resume transformations also participate in settlement deadline verification. Unfinished controls remain fenced for recovery review; never delete their markers to reconnect.

Migration: `20261108000200_lot_controls` adds the command journal and the durable per-lot pause timestamp/index. No environment variables or dependencies were added.

Responsive browser captures use synthetic API/authentication fixtures; they do not perform real marketplace cancellation. SQL/Redis integration and race checks use fresh isolated test namespaces/databases. Do not pause, resume or cancel the owner's demo lots merely to take screenshots.

Verified: nine monitor/database tests (including interruption during pause and resume, duplicate extension/cancellation, returned funds, watcher fanout, masked names and offline recovery audit); four individual-control Lua checks with competing funded bids, checkout and closing; four protected/public gateway checks; four client-control checks; eight native countdown checks; six focused browser scenarios. Adjacent recovery (15), pre-bid (12), bid Lua (6), purchase (13), buyer cancellation approval (9), closing (18) and catalogue (13) regressions pass. Suites that mutate global fee fixtures were rerun in separate fresh databases after a shared-database run exposed fixture interference; no checks were weakened. Local bid Lua p95 was 17.75 ms for 200 requests, not a production-capacity guarantee. Affected types/lint and local API/realtime/worker/admin/web production builds pass. Native physical-device visual acceptance remains pending.
