# Buyer bid history review

Owner-requested redesign, 2026-11-01. The account Bid history page now uses a full-width bordered workspace with All, Winning, Outbid, Won, Lost and Cancelled tabs. Hover uses pale indigo and a dark border; selected tabs use solid indigo/white. Arrow keys, Home/End and visible focus remain supported through the shared Tabs component.

Rows show the listing thumbnail, item name/reference, Lagos bid date/time, submitted direct bid or private automatic limit, authoritative position/result badge and View item action. Never label the submitted limit as the current auction price. Green indicates winning/won and red indicates outbid/lost/cancelled. Missing photos use a compact icon. Phone rows stack without horizontal page scrolling. Cancelled fixed-price competition retains its explanatory note.

Ten underlying bid records are read per cursor page, with Previous/Next and page number. Existing semantics are retained: show the newest bid per item within that page, and tabs filter that page only; one item can therefore recur on an older page. The page explicitly describes this scope. No global result counts or global status filtering are implied. Only the selected tab mounts live subscriptions. Owned database results reconcile silently every fifteen seconds and after focus/reconnection, retaining loaded rows on failure. No acceptance, outcome classification, fee, hold or payment algorithms changed.

| View | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| All bids | [Mobile](all-360.png) | [Tablet](all-768.png) | [Desktop](all-1280.png) |
| Cancelled tab | [Mobile](cancelled-360.png) | [Tablet](cancelled-768.png) | [Desktop](cancelled-1280.png) |
| Empty history | [Mobile](empty-360.png) | [Tablet](empty-768.png) | [Desktop](empty-1280.png) |

`scripts/check-buyer-bids-ui.mjs` uses synthetic buyer/bid fixtures, existing licensed representative demo photos and a mocked Socket.IO connection. It checks live Winning/Outbid display, confirmed outcomes, selected/hover styling, keyboard navigation, ten-record cursor boundaries, filtered empty state, retained rows during refresh errors, empty-history recovery and no money/bid mutations. Responsive screenshots were reviewed at all three widths. Affected lint/formatting, UI/web types and the buyer production build pass. No unrelated full-site or financial suites were run. Actual end-to-end warehouse or payment acceptance is outside this layout correction.
