# SMTP email delivery

The owner approved Resend SMTP and Nodemailer 10.2.1 on 2026-10-27. Both buyer verification codes and winner/invoice receipts use this transport. Existing branded HTML and plain text remain unchanged. No database migration or money/bid rule changes are needed.

## Delivery modes

- `AUTH_MODE=local`: local Mailpit capture only, even when SMTP credentials exist.
- `AUTH_MODE=smtp`: real SMTP delivery, requiring valid configuration. No silent fallback.
- Unset/unknown mode: buyer login is unavailable and pending receipts remain pending.

Port 587 with `SMTP_SECURITY=TLS` means required STARTTLS, not an immediate TLS socket. `STARTTLS` is also accepted. Ports 465/2465 use `SSL` or `SMTPS`. Known mismatched combinations are rejected. TLS certificate verification stays enabled, TLS 1.2 is the minimum, file/URL content loading is disabled, and SMTP protocol logging is disabled. Provider exceptions are replaced with a generic error so credentials, recipients and codes cannot leak through error logs.

The sender is configured with `SMTP_FROM_EMAIL` and `SMTP_FROM_NAME`. The owner-supplied temporary sender settings are stored only in the ignored private files. Email content remains Auction NG branded. Change the display name to Auction NG when ready.

For Resend, `SMTP_USERNAME=resend` and the password is a Resend API key. Set either `SMTP_PASSWORD` or `RESEND_API_KEY`; the explicit SMTP password wins. The API-key fallback applies only to `smtp.resend.com`. Resend requires a verified sending domain. No credential was supplied, so external delivery and domain verification have not been tested.

## PowerShell setup

1. Open PowerShell in the Auction NG folder. Edit your private settings:

   ```powershell
   notepad .env
   ```

2. Add your Resend key to the existing `SMTP_PASSWORD=` line (or `RESEND_API_KEY=`). Keep the supplied host, port, security, username and sender settings. Change the existing `AUTH_MODE=local` line to `AUTH_MODE=smtp`. Do not add duplicate settings or paste the key into chat/GitHub.

3. Sync email settings to the existing demo profile:

   ```powershell
   pnpm.cmd email:sync
   ```

   This copies only `AUTH_MODE`, `SMTP_*` and `RESEND_API_KEY` from `.env` to `.env.demo`. It preserves the demo database, encryption keys, wallet data and bid namespace. No demo reseed is needed. A later fresh demo seed also inherits the current `.env` settings.

4. Rebuild and restart the existing demo:

   ```powershell
   docker compose --env-file .env.demo -f docker-compose.yml -f infra/docker/demo.compose.yml up -d --build --wait
   ```

   Open http://localhost:3300 and request a code for an email address you control. In SMTP mode the code should reach that inbox; it will not appear in Mailpit. Requests to synthetic demo addresses ending in `.test` cannot establish real inbox delivery. Check your Resend dashboard if the provider rejects an unverified sender/domain.

5. To return to local capture, set `AUTH_MODE=local`, run `pnpm.cmd email:sync`, and repeat the Compose command. Mailpit remains at http://localhost:8025. Do not delete volumes or replace the demo encryption keys.

SMTP settings are read when the API starts; editing an env file alone does not change a running container. HTTPS remains required for production web sessions; Secure cookies are not weakened for SMTP.

After the current image has been built, later credential-only changes need `pnpm.cmd email:sync` and the same Compose command without `--build`.

## Receipts and tests

Pending encrypted receipts retain row-lock delivery and are marked sent only after SMTP accepts the recipient. Failure leaves them pending for retry. Reserved `.test`/`.invalid` recipients are never sent through external SMTP; their synthetic receipts are marked failed so they cannot block real recipients. Mailpit still captures them normally. SMTP batches contain at most five messages to bound network time inside the existing transaction; local batches retain twenty. Resend receives a stable `Resend-Idempotency-Key` based on the notification UUID, covering retries after a lost acknowledgement. Other SMTP servers may provide at-least-once delivery unless they support that header. Provider acceptance is not proof of inbox delivery.

Automated tests mock external SMTP and verify STARTTLS/implicit TLS, certificate checks, credentials, sender/template mapping, rejected recipients, error redaction, receipt idempotency headers and local-mode isolation. An API integration test verifies buyer login in SMTP mode with Secure/HttpOnly cookies. The email-config sync test protects demo isolation and existing payment/encryption settings. Tests do not contact Resend or send external mail.

References: [Resend SMTP configuration](https://resend.com/docs/send-with-smtp), [Nodemailer SMTP transport](https://nodemailer.com/smtp).
