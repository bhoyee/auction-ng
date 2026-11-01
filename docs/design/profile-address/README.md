# Profile address layout

2026-11-01: Full address shares the second Personal details row with Phone number at tablet/desktop widths. Keep the multiline address field; stack both fields on phones. Existing validation and save behaviour are unchanged.

Targeted component lint/formatting, web TypeScript and buyer production build pass. `node scripts/check-profile-ui.mjs --layout-only` verifies aligned side-by-side fields at 768/1280 px, stacked fields at 360 px, no overflow and no browser errors. No unrelated authentication, payment or bidding tests were run. Local Docker buyer preview updated.

Screenshots use synthetic account details: [360 px](profile-360.png), [768 px](profile-768.png), [1280 px](profile-1280.png).
