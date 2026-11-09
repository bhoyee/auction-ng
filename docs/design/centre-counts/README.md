# Pickup-centre live totals review

At 360, 768 and 1280px, synthetic browser fixtures show Items at centre and Pending pickup using shared indigo/yellow surfaces and tabular counts. Pending pickup is a subset of stock. Opening hours stay visible; the unexplained per-slot number is removed from list rows.

The browser verifies an automatic 42/7 → 41/6 change without page navigation, reload or replacement of the count panel. Offline values remain visible with the existing offline notice. Centre editing labels capacity as future booking and explains that it does not limit current check-in. No page overflow or browser errors occurred. Real database/API selection and event semantics are tested separately using isolated fixtures; screenshots contain no real warehouse or account details.

Evidence: `centres-*`, `updated-*`, `capacity-help-*` and `offline-*` at all three widths. Wider setup permissions, archive safeguards and Inventory navigation remain unchanged.

Local verification: 13 focused setup/count tests and two schema-dictionary assertions pass, as do affected lint/types and API/admin production builds. The additive migration is applied and both local Docker services restarted healthy. These checks do not claim T16 booking is implemented.
