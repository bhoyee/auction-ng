# Visit check-in review

Reviewed at 360, 768 and 1280 px on 2026-11-01. All identities, codes and QR tokens in these screenshots are synthetic browser fixtures, not usable customer passes.

| View | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Buyer pass | [Mobile](buyer-pass-360.png) | [Tablet](buyer-pass-768.png) | [Desktop](buyer-pass-1280.png) |
| Checked in | [Mobile](buyer-checked-in-360.png) | [Tablet](buyer-checked-in-768.png) | [Desktop](buyer-checked-in-1280.png) |
| Staff queue/checklist | [Mobile](staff-queue-360.png) | [Tablet](staff-queue-768.png) | [Desktop](staff-queue-1280.png) |
| Safe confirmation retry | [Mobile](confirmation-retry-360.png) | [Tablet](confirmation-retry-768.png) | [Desktop](confirmation-retry-1280.png) |
| Completed visit | [Mobile](buyer-completed-360.png) | [Tablet](buyer-completed-768.png) | [Desktop](buyer-completed-1280.png) |

The responsive check (`scripts/check-pickup-visit-ui.mjs`) covers pass privacy, no arrival before staff scan, failed scan retry, item pagination/scanning, a lost confirmation response with exact receipt retry, partial collection, automatic completion, pass expiry/renewal and empty state. Results are in `review.json`. The desktop check also verifies that closing the camera before permission resolves stops the eventual stream.

Visual review: brand tokens and font retained; QR/code legible; single buyer task; staff scanner and queue above an explicit checklist; mobile panels stack; no per-order buyer table or separate acknowledge/close step. Errors use red banners and successful arrival/collection uses green feedback. No decorative imagery or new dependency was added.

Twenty-two targeted API integration tests pass, along with affected lint/type checks and API/web/admin production builds. Native camera decoding depends on browser support and a secure context; keyboard scanner/manual entry remains available. Real warehouse hardware has not been physically tested.
