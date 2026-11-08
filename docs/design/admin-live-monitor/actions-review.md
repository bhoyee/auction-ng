# Lot action review — 2026-11-08

The following captures use synthetic staff/API/socket fixtures against the local production admin build, at 360, 768 and 1280px:

- `action-menu-{width}.png`: anchored dropdown, icons and separated red cancellation action.
- `bid-drawer-{width}.png`: Bids tab, WAT times, private automatic limits and paginated history.
- `cancel-lot-{width}.png`: cancellation effects, reason category/note and second confirmation in the final two minutes.
- `lot-workspace-{width}.png`: staff lot details, change history, and honest unrecorded batch/cost states.

Browser checks also verify role-hidden controls, extension choices, read-only menu after a silent closed-row update, the existing global-pause confirmation and bidder-message dialog. SQL/Redis tests cover actual financial and operational effects separately. No owner's demo auction was paused, resumed or cancelled for these captures. Native device review remains pending.
