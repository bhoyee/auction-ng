# Customer-service conversations

Owner approved guided, approved FAQs on 2026-11-01. This version does not call a generative AI service. It cannot change bids, payments, withdrawals or account security settings.

## Buyer and staff flow

- Signed-in buyers open `/customer-service`, start a conversation and choose an approved FAQ or ask the team. All, Open, In Progress and Resolved show only their own saved conversations, ten per page.
- FAQ buttons explicitly select static answers from `packages/shared/src/support-schemas.ts`. Free text is saved, with a prompt to choose a topic or request a person; it is not interpreted by an AI model.
- Asking the team changes the same conversation to human mode. No second ticket is created. If nobody is accepting conversations, the buyer can leave a message without a promised response time.
- Admin/support staff open Customer service in the staff portal, enable availability, claim a conversation and reply. Another staff member must release/claim before replying publicly. Private notes remain staff-only. Staff can create a conversation for an existing buyer by email.
- Either side can resolve/reopen. Reopening preserves all messages. Status filters represent the stored conversation status, not whether the buyer is online.

## API and security

Typed contracts live in `@auction-ng/shared` and `@auction-ng/api-client/support`; Nest Swagger documents `/support` routes. Read operations expose availability, conversations, paginated messages and authenticated image downloads. Writes create conversations, send messages, update presence or perform versioned actions.

Buyer ownership is checked on every read, write and attachment. Only admin/support roles can use staff routes; other staff roles are denied. Writes revalidate sessions and authentication versions, lock the actor/conversation and use unique request keys plus payload hashes. Exact retries return the saved result, including after resolution; changed payloads cannot reuse a key. Concurrent claims use a conversation version check. All staff mutations are audited.

Subjects, references, message bodies and attachment contents are encrypted at rest. Private notes/files never appear in buyer API responses or events. Cursor signatures bind pagination to its owner/filter/conversation. Messages use monotonically increasing per-conversation sequence numbers. List queries are bounded, indexed and use a fixed number of relation queries.

Shared limits: five buyer-created conversations per day, fifty staff-created conversations per day, 4,000 characters per message, two images per message, twenty images per conversation and 1,000 messages per conversation (with a final resolve action allowed). Per-minute limits are 180 reads/30 writes per actor and 600 reads/90 writes per IP. Page size defaults to ten and never exceeds fifty.

## Live delivery and weak networks

Messages commit before Redis/Socket.IO invalidation. Events carry conversation IDs, never message bodies, private notes, buyer IDs or email addresses. Authenticated owner/staff rooms control delivery; subsequent API reads enforce current access. The active conversation reconciles every five seconds, the inactive inbox every fifteen seconds, and both recover on focus/online. Failed reads retain content; definitive denied access clears it. Ambiguous sends retain the original request and key for an exact retry, preventing duplicate messages.

Staff presence renews every twenty seconds and expires after sixty seconds. Presence means a staff member opted to accept conversations, not a guarantee of immediate response.

## Images

The browser compresses screenshots; the API independently verifies JPEG/PNG/WebP bytes, rejects animated/invalid files, strips metadata and resizes to at most 1,600 pixels. Stored WebP output is at most 220 KB. Support JSON requests have a scoped 1 MB limit; other JSON endpoints keep their existing 100 KB limit.

Images first commit as encrypted database staging alongside their message. A bounded background job uploads encrypted bytes to the existing private R2 upload bucket, then replaces the staged bytes with a private object key. External storage is never called while conversation locks are held. Failed uploads leave the staged image available for a later attempt. Downloads require current conversation access and return private, no-store responses.

Use existing R2 environment settings for production. Without configured private R2 writes, production reports images unavailable. Encrypted database storage is allowed for local authentication, isolated tests and the demo database only. There are no public attachment URLs.

## Notifications and operation

Human replies and relevant status changes enqueue existing in-app/email notifications. Emails contain a generic update, ticket reference and secure conversation link; they do not contain chat text. Existing SMTP/EmailProvider configuration is reused.

Set the same random `SUPPORT_DELIVERY_TOKEN` (at least 32 characters) on API and worker. Keep it secret. The worker polls a dedicated BullMQ queue every five seconds and calls the private `/internal/support/deliver` endpoint. It delivers the support email outbox and offloads a bounded attachment batch independently of auction activity. Its API origin must be internal HTTP (`api`, `localhost` or `127.0.0.1`). Do not expose this token to browsers.

The additive migration is `20261101000300_support_conversations`. The full table/column/type/relation/index dictionary is in [database-schema.md](database-schema.md). No existing migration or financial ledger rule is changed.

## Validation and remaining scope

Seventeen targeted isolated API/Redis/Socket.IO/BullMQ tests cover ownership, roles, private notes/images, idempotency, concurrent claims, cursors, handoff, resolution, notifications, storage and request boundaries. `scripts/check-support-ui.mjs` exercises responsive buyer/staff workflows with synthetic API/socket fixtures. See [screen review](../design/customer-support/README.md).

Native mobile customer-service screens remain T14; the shared typed API is ready. Generative AI, external chat vendors, staffed operating hours, service-level promises and a legally approved retention schedule are future work. The draft privacy page describes support storage; review policy/retention before public launch.
