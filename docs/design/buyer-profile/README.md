# Buyer profile refinement

2026-11-01, owner approved. Replace the plain stacked account form with a compact initials/name/email header, verified-email badge and separate Personal details / Change password cards. Shared profile components, textarea and brand-token styles live in `packages/ui`; no new dependency or avatar-upload feature.

Personal details uses two columns on tablet/desktop and stacks on phones. The verified sign-in email remains read-only and visually muted. Phone collection is optional and does not imply verification. Full address uses a labelled multiline field. Save changes is a filled indigo action with existing hover/focus treatment. Green success and red error banners are dismissible; failed saves retain entered details. The saved server response updates the account header and normalised phone/address fields.

Password controls retain the existing visibility toggles, 12-128 character limits, confirmation check, current-password requirement and existing API. The copy clearly explains that changing the password signs out all devices and returns to sign-in. No new authentication, profile, payment or bidding rules were introduced. Offline users retain their fields and cannot submit; the existing global offline banner applies. Shared busy state prevents concurrent profile/password submissions.

Drafts are not overwritten by focus or background session updates. The form is keyed to the authenticated buyer ID, so changing accounts mounts a fresh form. No pretend identity verification, strength score or security statistics are displayed.

| View | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Profile | [Mobile](profile-360.png) | [Tablet](profile-768.png) | [Desktop](profile-1280.png) |
| Saved | [Mobile](saved-360.png) | [Tablet](saved-768.png) | [Desktop](saved-1280.png) |

`scripts/check-profile-ui.mjs` uses synthetic account details and mocked API responses only. Passed at all three widths: read-only email, verified header, readable mobile identity area, draft retention, failed-save retry, actual profile request shape/normalised phone, coloured feedback, password show/hide, mismatch blocking the request, rejected-password retry, successful return to sign-in and no horizontal overflow. Affected lint/formatting, UI/web TypeScript and buyer production build pass. Full-site, money and bidding suites were not rerun; backend password/session rules are unchanged.
