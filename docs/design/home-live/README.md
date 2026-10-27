# Live home catalogue

2026-10-27: home collections now recompute against server-aligned time every second. All lots at or below 20 minutes are excluded from Top Deals, including overflow beyond the six selected Closing now lots. Timers are blue above 20 minutes and red at or below 20 minutes, never yellow. Received live end-time extensions move cards between sections as appropriate.

Visible-page catalogue metadata refreshes silently every 15 seconds, on focus/reconnect and after debounced live updates. Refresh uses the existing bounded catalogue API (up to three cursor pages, 50 per page), does not reload the document, and does not overlap requests. Prices retain their existing websocket freshness gates. Elapsed/terminal cards disappear from active catalogue grids; the server still owns auction closing and settlement. A failed clock resync retains the last measured offset so elapsed cards cannot return.

## Focused validation

37 tests passed across `home-collections`, `catalogue-lifecycle` and `ui-presentation`. Changed-file lint/format, web typecheck and production build passed. No unrelated full suite was run.

The reproducible browser check uses intercepted local catalogue/time/websocket responses and a controlled browser clock. It verifies the 20-minute transition, no duplicates, expiry removal, soft-close end-time updates, discovery of a newly published lot, blue/red timer styles and a clock-resync outage. It does not mutate the demo database, bid engine or payment data. Fixtures have intentionally synthetic titles and no photos.

With local web/API running, execute in PowerShell:

```powershell
pnpm exec node scripts/check-home-live.mjs
```

[Observed results](review.json).

| Width | Top Deals fixture | Closing now fixture |
| --- | --- | --- |
| 360 | [Preview](top-360.png) | [Preview](closing-360.png) |
| 768 | [Preview](top-768.png) | [Preview](closing-768.png) |
| 1280 | [Preview](top-1280.png) | [Preview](closing-1280.png) |

Actual auction price updates remain live over Socket.IO; catalogue-only metadata such as the persisted bid count may take the next refresh to appear. The home stock pool remains bounded as before. Overall T13 acceptance and its performance budget remain open.
