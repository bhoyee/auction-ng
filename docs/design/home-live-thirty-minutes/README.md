# Thirty-minute Closing Now window

2026-11-04: targeted browser check against localhost:3300 with controlled catalogue/socket fixtures. Verifies transition at 30 minutes, exclusion from Top Deals, red closing/indigo longer timers, live extensions, expired item removal, silent metadata refresh and clock-resync outage. No database, payment or bid mutations.

Screenshots: closing-360.png, closing-768.png, closing-1280.png, top-360.png, top-768.png, top-1280.png. Exact assertions/results: review.json. All 14 affected home/native countdown tests and targeted lint/UI types pass; affected web/API/admin builds pass.
