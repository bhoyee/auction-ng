# Conversation list refinement

The subject and SUP reference form one left-aligned group. Status and last-updated date/time form a separate right-aligned group. Inboxes at least 640 px wide align status, timestamp and a chevron horizontally; smaller inboxes stack the timestamp below the badge. Dates include the year and times use Africa/Lagos with an explicit WAT label. Long subjects are limited to two lines, with the full title available on hover and in the opened conversation.

Buyer rows omit the repeated assistant/agent line. Staff rows retain buyer and assignment context. Hover has a subtle canvas fill and indigo edge; the last opened buyer record and selected staff/popup record have a pale indigo fill and stronger selected edge. The row is a keyboard-operable button. Existing filters, cursor pagination and saved chat behaviour remain unchanged.

Screenshots focus on the conversation workspace at each viewport width. The floating chat launcher is hidden in these captures so it does not cover row metadata; it remains available in the application and in the full-page support screenshots.

| State | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| All | [View](all-360.png) | [View](all-768.png) | [View](all-1280.png) |
| Open | [View](open-360.png) | [View](open-768.png) | [View](open-1280.png) |
| In Progress | [View](in-progress-360.png) | [View](in-progress-768.png) | [View](in-progress-1280.png) |
| Resolved | [View](resolved-360.png) | [View](resolved-768.png) | [View](resolved-1280.png) |
| Selected and hover | [View](selected-hover-360.png) | [View](selected-hover-768.png) | [View](selected-hover-1280.png) |

`scripts/check-support-ui.mjs` uses synthetic browser API/socket fixtures to verify all four filters, aligned row groups, WAT timestamps, two-line titles, whole-row chat opening, retained selection and computed hover colour at all three widths. Existing focused support workflows also exercise the shared row component in the popup and staff inbox. No backend, money, bidding or full-site suites are needed for this presentation-only change. Targeted lint/formatting, shared UI types and buyer/admin production builds accompany the browser review.
