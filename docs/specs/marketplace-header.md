# Buyer header

Owner-requested refinement, 2026-10-27. The header uses the shared wordmark, Schibsted type, indigo actions, Lucide icons and shared control styles.

The main row contains the logo, search, Help, WhatsApp and account actions. Sign in is outlined; Create account is solid indigo. Phones use a compact search button while retaining its accessible name. Signed-in buyers keep watchlist, wallet, notifications and account controls.

The separate shopping row contains All categories, All deals, Top deals and Ending soon. Category names appear inside the dropdown. All deals is a paginated open-lot catalogue; Top deals opens the existing home collection; Ending soon retains the final-hour filter. The removed announcement never appears in production or demo headers. Clearly labelled synthetic content remains visibly identified in the local demo.

Help opens Help centre, FAQs, Contact us and Returns & refunds. Menus close on Escape, outside click and navigation. The returns section does not invent legal terms; the business's approved policy remains required before real auctions launch.

## Change the WhatsApp number

1. Open PowerShell in the project folder and run `notepad .env`.
2. Edit this line, keeping the leading `+` and country code:

   ```dotenv
   SUPPORT_WHATSAPP_NUMBER=+2349094153385
   ```

   This is a public business contact, not a secret. No account credentials or API keys are needed. A blank or invalid number leaves the WhatsApp control unavailable instead of sending buyers to an invented contact.

3. For the isolated local demo, update the same line in `.env.demo` too (`notepad .env.demo`). This private profile retains its own configuration so demo storage and encryption remain isolated.
4. Restart only the website:

   ```powershell
   docker compose --env-file .env.demo -f docker-compose.yml -f infra/docker/demo.compose.yml up -d --no-deps --wait web
   ```

   For the normal `.env` profile, use `docker compose up -d --no-deps --wait web` instead. A number-only change needs no image rebuild.

5. Open http://localhost:3300 and choose WhatsApp. It should open a conversation with the configured number. Opening the link does not automatically send a message.

[Responsive review captures](../design/header/README.md). The broader T13 loading-budget and visual-acceptance gates remain separate and open.
