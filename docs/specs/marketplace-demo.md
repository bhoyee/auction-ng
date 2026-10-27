# Photographic buyer marketplace demo

This is T13b, the redesign of the buyer website. Native buyer screens remain T14. Email codes remain the sign-in method. Stock photos represent demo products only; their authors and licences are listed in [photo credits](../../apps/web/public/demo/CREDITS.md).

The catalogue contains 120 synthetic lots illustrated by 60 distinct credited product photographs. Home rails exclude repeated lot IDs and repeated representative photos. Existing isolated demos can receive only the photo/title update with `node scripts/update-demo-photos.mjs`; this refuses production, main databases and settled demo inventory, and preserves schedules, bids and funds. A fresh seed includes the same photo variety automatically.

## Windows setup

1. Install Git for Windows, Node.js **22.23.4**, and Docker Desktop. Start Docker Desktop and wait for the Linux engine to be running. The [main setup guide](../../README.md) has installation links.
2. Open PowerShell in the project folder:

   ```powershell
   Set-Location 'C:\Users\bhoyee-pc\Desktop\auction-ng'
   npm.cmd install --global pnpm@10.18.3
   pnpm.cmd install --frozen-lockfile
   ```

   Keep your existing `.env`. On a new checkout only, run `Copy-Item .env.example .env`, then follow the README's local key setup. Never upload this file.

3. Start the three storage services:

   ```powershell
   docker compose up -d postgres redis meilisearch
   pnpm.cmd db:migrate
   docker compose ps
   ```

   PostgreSQL, Redis and Meilisearch should show healthy. The migration command applies the additive database updates without resetting existing data.

4. Create a fresh photographed demo:

   ```powershell
   pnpm.cmd db:seed:demo
   ```

   Expect 120 lots, 12 categories, three sample pickup hubs, synthetic funded bids and watchlists. This creates a separate database and Redis namespace, and writes private `.env.demo` settings. Your existing database is retained. Each run creates a new retained demo database, with 20 lots each closing in 6 hours, 12 hours, 24 hours, 3 days, 4 days and 5 days from setup. Within each group, lots close one minute apart over 19 minutes. It never extends or rewrites accepted bids. The Ending soon page is empty until lots enter its final-hour filter.

5. Build and start the demo applications:

   ```powershell
   docker compose --env-file .env.demo -f docker-compose.yml -f infra/docker/demo.compose.yml up -d --build --wait
   docker compose ps
   ```

   Wait for the services to become healthy. Open **http://localhost:3300** for the buyer website, **http://localhost:3301** for admin, and **http://localhost:8025** for the local email inbox. The buyer site should contain product photos, category navigation and open auction cards. Ports 3000 and 3001 are not needed.

   If the demo later expires, repeat step 4, then run the same Compose command without `--build`. This selects fresh demo storage while retaining the old database. Sign out and sign in again: accounts created in the previous demo remain in its retained database. Reuse the seeded demo account below for funded bidding tests.

6. Choose **Create account**, enter a demo email, open Mailpit at port 8025, and copy the six-digit code. Finish with your name. Verified email is required for bidding; phone verification comes later. You must still have an eligible active buyer account and enough wallet funds to cover your bid and fees. A new account starts empty. The seeded `demo-buyer-3@example.test` account has synthetic demo funds; its email code also arrives in Mailpit. Never treat demo balances as real money. Paystack live payments are disabled in this profile.

7. To see logs:

   ```powershell
   docker compose logs --tail 50 web api realtime worker
   ```

   To stop without deleting data, run `docker compose stop`. To return to your original application database, run `docker compose --env-file .env up -d --wait`. Do not use `down -v`.

## Checks

`pnpm test:redesign` creates another isolated demo, builds the production website and checks the photographed catalogue at 360, 768 and 1280 pixels. On Windows it uses Docker Desktop's Linux engine and the pinned Playwright browser image, matching CI. The first run downloads that image and builds the test tools; later runs reuse the dependency layers. Keep the three storage services running. It retains existing application containers and data.

The check records screenshots, per-route compressed JavaScript sizes and standard mobile Lighthouse LCP. Run it separately from other builds/browser suites so local CPU contention does not distort the loading measurement. The normal `pnpm test:e2e` financial journey remains required separately. Reports are written under ignored `test-results/`; they contain synthetic accounts only. Pickup QR images are masked in review captures. Full-page screenshots expose offscreen sections explicitly; Lighthouse measures a separate, untouched browser page.

The demo does not complete real Paystack webhook/provider acceptance, real R2 photo acceptance, production phone verification or native app screens. Those existing task boundaries remain open.
