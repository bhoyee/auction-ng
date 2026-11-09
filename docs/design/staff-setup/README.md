# Staff setup and account controls review

The separate category/centre sidebar entries shown in these initial captures are superseded by [Inventory navigation](../inventory-navigation/README.md), following the owner's navigation correction.

Synthetic API fixtures against the updated admin preview verify category creation, centre editing, the initials account menu, read-only profile email, persisted compact preference display, audit details and a 240px inventory description field at 360, 768 and 1280px. Separate integration tests exercise the real API/database with test-only authentication fixtures; browser interception does not replace permission or persistence testing.

Captures: `categories-*`, `centres-*`, `centre-edit-*`, `account-menu-*`, `profile-*`, `preferences-*`, `audit-detail-*`, `description-*`. Empty/error recovery is checked separately in `empty-*` and `error-*`. Document overflow and browser runtime errors are checked. Colours, type, hover/focus treatment and spacing use the existing shared design tokens/components. No real account data, credentials or warehouse addresses appear in these images.

Rollout: the additive migration is applied locally; API/admin production builds passed and both Docker services restarted healthy. API health and the admin page return HTTP 200. Existing configuration, Redis, workers, account records and warehouse data were preserved.

Profile saving is separately checked with a controlled browser clock: changing personal details does not postpone renewal of the current staff access token.
