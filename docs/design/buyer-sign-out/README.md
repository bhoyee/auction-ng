# Buyer sign-out correction

2026-11-01: the buyer dropdown Sign out uses the existing sidebar logout handler. After the API confirms sign-out, replace the document with `/` to discard private state without racing the protected-page sign-in redirect. Failed sign-out preserves the current session and offers a red floating error; the pending action is disabled with a waiting cursor.

The shared dropdown button inherits menu typography and colour, removes native borders/background and has the same pale-indigo hover/focus feedback as links, with an explicit pointer cursor and 44 px touch target.

`scripts/check-sign-out-ui.mjs` uses synthetic account/API fixtures to check hover, cursor, failure/retry, disabled pending state and homepage navigation without visiting sign-in at 360, 768 and 1280 px. Screenshots: [360 px](hover-360.png), [768 px](hover-768.png), [1280 px](hover-1280.png). No real session or payment credentials are captured.
