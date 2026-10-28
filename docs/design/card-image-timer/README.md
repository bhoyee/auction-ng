# Image-overlay countdown

The shared web item card shows a four-part `1d | 5h | 15m | 17s` countdown over the bottom centre of its image. Indigo/white normally, red/white for the final 20 minutes. The timer remains visible without hovering; the bid count appears in the item-detail Bid history tab instead of on cards.

`card-360.png`, `card-768.png` and `card-1280.png` show the actual local demo cards. Corresponding `home-*.png` captures show their placement on the homepage. Review evidence is in `review.json`.

Focused verification: countdown presentation tests, affected UI/web type checks, targeted ESLint/Prettier, buyer production build and responsive browser checks. The browser checks verify four segments, ticking seconds, image containment, absent card bid counts and no horizontal overflow/browser errors. No full application or money/bidding suite is run for this presentation-only change.

```powershell
node scripts/check-card-timer.mjs
```

Preview at http://localhost:3300/. Auction mechanics and stored data are unchanged.
