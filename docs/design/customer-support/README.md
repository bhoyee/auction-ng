# Customer-service screen review

Buyer floating chat, saved-conversation history and staff support desk, reviewed at 360, 768 and 1280 px. Shared Schibsted typography, brand tokens, restrained borders, filled primary actions and explicit private-note styling. The buyer chat shows one conversation at a time in a bounded corner window; history remains on the account page. No horizontal page overflow. FAQ suggestions, offline availability, saved messages, errors, retry feedback and resolution states remain explicit.

| State | Phone 360 | Tablet 768 | Desktop 1280 |
| --- | --- | --- | --- |
| Empty inbox | [View](empty-360.png) | [View](empty-768.png) | [View](empty-1280.png) |
| Guided assistant | [View](assistant-360.png) | [View](assistant-768.png) | [View](assistant-1280.png) |
| Human conversation | [View](human-360.png) | [View](human-768.png) | [View](human-1280.png) |
| Staff/private note | [View](staff-360.png) | [View](staff-768.png) | [View](staff-1280.png) |
| Resolved | [View](resolved-360.png) | [View](resolved-768.png) | [View](resolved-1280.png) |

## Verification

`scripts/check-support-ui.mjs` runs only the affected buyer/staff screens against the production builds. Synthetic API/socket fixtures exercise simple first-message creation, explicit FAQ selection, compressed images, uncertain send retries (including a rate-limited retry), typed human handoff, availability, separate public/private drafts, hidden private notes, live public replies, resolve/reopen and status filters. Popup checks cover minimise/reopen without losing drafts, close/Escape focus return and notification deep links. [Machine-readable results](review.json). Fixtures do not send real email or expose customer data.

Nineteen separate isolated integration tests exercise the real API, PostgreSQL, Redis/Socket.IO and BullMQ boundaries: permissions, ownership, private files, idempotency, concurrent claims, encryption/storage, notifications, delivery authorization, request limits and typed handoff on creation/reply/retry. Targeted ESLint/Prettier and affected TypeScript checks pass. API, realtime, worker, web and admin production builds pass. Unrelated money/bid suites were not rerun or weakened.

The local demo migration is applied and all five application services are running from the completed Docker image. Buyer entry: <http://localhost:3300/customer-service>. Staff entry: <http://localhost:3301>, signed in as admin/support. Enable accepting conversations and claim a human conversation before replying. Email delivery uses the configured EmailProvider; actual inbox delivery depends on valid local SMTP credentials. No generative assistant or native mobile screen is claimed.
