# Lot action review — 2026-11-08

The following captures use synthetic staff/API/socket fixtures against the local production admin build, at 360, 768 and 1280px:

- `action-menu-{width}.png`: anchored dropdown, icons and separated red cancellation action.
- `bid-drawer-{width}.png`: compact item context, distinct bid-method badges, aligned amounts/WAT times, and a fixed pagination footer. Remove the administrator/security explainer from the presentation; permissions and auditing remain enforced.
- `cancel-lot-{width}.png`: cancellation effects, reason category/note and second confirmation in the final two minutes.
- `lot-workspace-{width}.png`: photo gallery with zoom, separate auction overview/schedule, item description and an activity timeline. Batch/cost stay unrecorded until real records exist.

Polish amendment: smaller 18px lot-dialog headings and 14px item names; 2/10/30/60-minute extension choices; shared red close icons with solid red/white hover/focus feedback on web/admin, and red pressed feedback in the native shared dialog. The history stress check keeps a nine-digit Naira amount readable at 360px without horizontal overflow. A buyer-site popup independently verifies the shared close hover. Gallery zoom and responsive full-workspace navigation also pass.

Browser checks also verify role-hidden controls, extension choices, read-only menu after a silent closed-row update, the existing global-pause confirmation and bidder-message dialog. SQL/Redis tests cover actual financial and operational effects separately. No owner's demo auction was paused, resumed or cancelled for these captures. Native device review remains pending.
