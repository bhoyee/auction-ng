# Buyer navigation polish

2026-11-01: make all Bid history tab labels and the All categories / All deals / Top deals / Ending soon shopping labels bold (700). Add consistent decorative 18px Lucide icons to every buyer account-dropdown entry, retaining labels, watchlist count, destinations and sign-out behaviour.

Reviewed screenshots: [360px](menu-360.png), [768px](menu-768.png), [1280px](menu-1280.png). Synthetic authenticated buyer and bid fixtures only.

`scripts/check-buyer-navigation-ui.mjs` passes at each width: all six tab weights, shopping link/category weights, icons and accessible labels, 44px dropdown targets, viewport containment, Escape dismissal/focus return and no horizontal page overflow. Relevant ESLint/Prettier, UI/web types and buyer production build pass. No unrelated full-site or financial tests were run.
