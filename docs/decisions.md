# Decisions log

Place this file at `docs/decisions.md`. Add newest decisions at the top. Agents must not reverse a decision here without asking.

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-10-18 | Brand direction: adire indigo + danfo yellow (live signals only), Schibsted Grotesk, Lucide icons, flat cards; rules in docs/DESIGN.md | Distinct, local, trustworthy look that doesn't read as a generated template |
| 2026-10-18 | Design system (task D01) is built and approved before any screen work | Fixing the look later would mean touching every screen |
| 2026-10-18 | Host on one VPS with Docker Compose and Coolify, Cloudflare in front | Shared/cPanel hosting cannot run Redis, workers or WebSockets; a VPS is cheap and fully controllable |
| 2026-10-18 | TypeScript monorepo (pnpm + Turborepo): Next.js web/admin, Expo mobile, NestJS API | One language for web, mobile and backend speeds up AI-assisted building and shares rules |
| 2026-10-18 | Bids accepted in a Redis Lua script; PostgreSQL written asynchronously by a worker | Keeps bid acceptance under 50 ms and atomic under concurrency |
| 2026-10-18 | Money stored as integer kobo; wallet as a double-entry ledger | Prevents rounding errors and makes every naira traceable |
| 2026-10-18 | Wallet funded by Paystack Dedicated Virtual Accounts (bank transfer first, cards later) | Bank transfer is the most common way Nigerians pay online |
| 2026-10-18 | Buyers must have wallet balance to cover a bid (funds held) | Stops non-paying winners; open for owner review |
| 2026-10-18 | Pickup at launch, partner delivery in phase 2 | Simplest loop to launch; delivery added behind a provider interface |
