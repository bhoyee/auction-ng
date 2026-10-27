# Open home tab updates

2026-10-27: the owner still saw Ended cards in an existing localhost:3300 tab. A fresh real browser observed ticking active auctions and repeated catalogue refreshes without Ended cards. The specific existing tab was not available for inspection, so stale loaded code remains a possible explanation rather than a proven cause.

The buyer layout now checks `/api/web-version` on home every 15 seconds and on focus/reconnect. The endpoint returns only the running production build identifier with no-store headers. A different build triggers one document reload; identical/dev versions do not. Reload is deferred while typing and version polling is disabled outside home. Ordinary catalogue polling does not reload the document.

An already-open tab that predates the check needs one reload to receive this code. The check cannot retroactively execute in an older JavaScript bundle.

Validation: 8 targeted version/collection/expiry tests passed; changed-file lint/format, web typecheck and production build passed. [Focused browser results](review.json) verify changed-build reload, typing deferral, same-version stability and non-home isolation. The existing live-catalogue browser check also passed again, including expiry removal and clock-resync failure. No full suite was run.

With the local web running:

```powershell
pnpm exec node scripts/check-home-version.mjs
```

T13 acceptance remains open. No bid, money or settlement code changed.
