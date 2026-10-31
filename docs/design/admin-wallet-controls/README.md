# Admin wallet controls review

2026-10-31. MONEY/BID CHANGE - needs human review. Synthetic browser fixtures; no real financial or admin settings were changed by browser checks.

Shared token-based components, Schibsted type and Lucide icons. Separate labelled global controls, required reason, confirmation, solid success/error feedback and accessible full-row labels. A stale revision requires reload. A failed settings read disables editing and leaves a working reload action.

Buyer fields and funding/withdrawal buttons disable on pause, retain entered values and update silently after resume. Payment recovery remains available. Browser checks cover both independent flags, confirmation, save feedback, conflict handling, settings-read failure and cross-page silent refresh at each width. No horizontal page overflow; tables retain their own scroll area.

| Width | Admin | Confirmation | Buyer paused | Buyer resumed | Conflict |
| --- | --- | --- | --- | --- | --- |
| 360 | [View](admin-360.png) | [View](confirmation-360.png) | [View](buyer-paused-360.png) | [View](buyer-resumed-360.png) | [View](conflict-360.png) |
| 768 | [View](admin-768.png) | [View](confirmation-768.png) | [View](buyer-paused-768.png) | [View](buyer-resumed-768.png) | [View](conflict-768.png) |
| 1280 | [View](admin-1280.png) | [View](confirmation-1280.png) | [View](buyer-paused-1280.png) | [View](buyer-resumed-1280.png) | [View](conflict-1280.png) |

Backend checks cover admission versus pause for each money path, simultaneous deposit/withdrawal/pause lock ordering, existing payment/withdrawal completion, duplicate settings saves, stale revisions, audit and authorization. API/worker/web/admin builds, relevant types and changed-file lint pass. No unrelated full-site suites were run. See [contract](../../specs/wallet-controls.md).

Validation outcome: 43 distinct targeted cases across the affected deposit, withdrawal and control suites, with focused final lock-order checks. Browser coverage also confirms a delayed background settings response cannot overwrite unsaved administrator edits. Local real settings remain enabled at revision 0; only mock browser settings were paused during screenshots.
