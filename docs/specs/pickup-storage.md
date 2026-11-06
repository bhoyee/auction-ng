# T16 pickup deadlines, storage charges and review

Status: owner requirements recorded; implementation is awaiting the money/date clarifications below. No storage charge, automatic debit, deadline backfill or forfeiture has been activated. This is the pickup/storage portion of T16; slot booking and capacity remain separate acceptance work.

## Confirmed scope — 2026-11-06

- Five working days for collection once the item is both paid and ready at its collection centre. Display an exact WAT deadline on buyer web/mobile, invoices and notifications.
- Storage charge starts at ₦1,000 daily, with a ₦10,000 cap. Administrators can configure the rate/cap. The preceding recommendation was per uncollected item; preserve item-level tracking so partial collection cannot keep charging collected goods.
- Never deduct storage charges automatically from a wallet. Staff open an outstanding-charge checkout at collection. Buyer-confirmed payment supports available wallet balance or direct Paystack hosted card/one-time transfer checkout, without requiring wallet funding first. Show the amount/method/processing charges before confirmation. No arbitrary staff wallet debit or browser-controlled Paid flag.
- Allow the administrator to assign/reassign collection-review work to another authorised staff member. Assignment does not itself grant fee-setting, waiver, approval or wallet permissions; use existing roles/capabilities.
- Send two pre-deadline reminders on different days, using professional email, in-app notification and enabled phone push. Proposed schedule: two working days and one working day before the deadline. Use durable per-item/deadline-version reminder keys; deadline changes must invalidate obsolete jobs and avoid duplicate messages.
- After ten days, flag for staff/admin review and contact with the buyer. Require explicit administrator approval before any forfeiture or relisting; never automatically sell an already-paid item again.
- Authorised staff can extend deadlines or waive charges only with a reason and audit record. Keep the original deadline, responsible staff, before/after values and timestamps. Separate extension from waiver; record the financial effect explicitly rather than silently rewriting history.
- Reconcile collection state, receipts, warehouse stock and storage charges, plus storage checkout/payment/ledger receipts. Expose paginated exceptions, ownership and resolution notes in the staff portal.

## Clarifications requested

1. Do daily accrual and the ten-day review both use the centre's working days from paid-and-ready time? Recommended: five free working days, storage from day six, review after working day ten. Define daily cutoffs before implementing accrual. Centre closure/holiday calendars must be explicit; do not bill a day the approved calendar excludes.
2. Does the new charging policy apply only to newly published listings disclosed before bidding/buying, or also existing purchases with a fresh notified grace period? Recommended: newly published listings only, with no retroactive charges. Freeze the policy for a buyer's purchase; later global rate/cap changes must not silently reprice existing commitments.
3. What refund/deduction treatment applies to original purchase money after approved forfeiture? Recommended initial boundary: contact/review only, with actual forfeiture/relisting blocked until this rule is agreed. No unapproved confiscation, refund or re-sale.
4. Is ₦1,000 the complete daily storage charge before separately disclosed Paystack processing charges, or should additional tax be added? Do not invent a tax rate or charge an undisclosed addition.

## Implementation plan

Work on `task/t16-pickup-storage` in small commits after the required clarifications.

1. Shared policy/calendar and integer-kobo charge calculations in `packages/shared/src/pickup-storage-rules.ts`, with tests first for free-period boundaries, WAT dates, closed days, cap, partial collection, extensions and waivers. Keep fee maths in the shared fee layer. The server clock determines dates and amounts.
2. Additive Prisma migrations and schema documentation for versioned storage policies, item-level collection obligations, assignments/reviews, audited adjustments, quotes/payment attempts, reminder markers and reconciliation results. Specify every column, type, relation, unique key and query index. No edits to committed migrations or historical invoice lines.
3. Typed schemas/client and OpenAPI routes for buyer deadlines/quotes/confirmations, staff queues/configuration/assignment/adjustments and reconciliation. Keep all mutations permission checked, strictly validated, rate limited and idempotent. Only the ledger module writes ledger entries.
4. Implement APIs under `apps/api/src/pickup`, integrating collection confirmation in `visit-service.ts` so only the selected, eligible, settled/waived items leave the centre. Lock/recheck the obligation, invoice/item and payment state against concurrent collection, extension, waiver and duplicate callbacks.
5. Reuse the existing PaymentProvider, hosted checkout and verified webhook/transaction pattern for a separate storage-purpose payment reference. Direct card/transfer settlement pays the storage obligation rather than performing an ordinary wallet top-up. Wallet payments require buyer consent, available funds and atomic ledger posting. Verify reference/owner/purpose/amount/currency, and settle once. Define exception handling for late, duplicate or adjustment-racing provider payments before enabling checkout.
6. Add bounded BullMQ jobs in `apps/worker` for reminder scheduling, overdue/review flags and reconciliation. Durable jobs/receipts prevent repeated delivery or charges. Reconciliation observes and flags mismatches; it does not silently alter money, replay a payment, collect stock or authorise forfeiture.
7. Add a staff Pickup management page for Ready, Due soon, Overdue, Review required and Collected, plus assigned-case filtering, fee checkout, audited extensions/waivers and reconciliation exceptions. Global fee settings remain restricted to explicitly authorised staff. Use shared components and existing silent refresh behavior.
8. Update `apps/web/components/awaiting-pickup.tsx`, invoice/pickup shared views and `apps/mobile` pickup/invoice screens, including the mobile invoice document, notification templates and item/bid/purchase policy disclosure. All surfaces read the same stored deadline/policy and server-calculated amount.

## Verification and rollout

Before activating money behavior, cover concurrent payment/waiver/collection, duplicate and delayed webhooks, insufficient funds, authorisation failures, reminder rescheduling, partial collections and restart-safe reconciliation in isolated databases. Test web/admin at 360/768/1280 and mobile at 360, plus appropriate affected lint/types/builds. Do not run unrelated full-site suites for small follow-up layout changes; retain full CI checks.

Any implementation PR changing storage charges or payment execution must say **MONEY/BID CHANGE — needs human review**. No live Paystack keys or endpoints during implementation/testing. Mark T16 done only after its applicable acceptance criteria, including any agreed slot-booking scope, are met.

Provider references checked while preparing this plan: [Paystack transaction API](https://paystack.com/docs/api/transaction/) and [Paystack webhooks](https://paystack.com/docs/payments/webhooks/). Existing application provider/verification code remains the integration boundary.
