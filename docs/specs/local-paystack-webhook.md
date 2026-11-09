# Local Paystack test webhook

Checked 2026-10-30. This uses the existing test-only Paystack integration, Docker API and an installed free ngrok agent. It does not enable live payments or change ledger/bidding rules.

## Current setup

The test key in ignored `.env` was accepted by Paystack's read-only balance endpoint. `pnpm paystack:local` recreated the API with that key while retaining `.env.demo` database/auction settings. The key is passed in the child process environment; it is not printed, passed as a command argument, copied to `.env.demo`, exposed to clients or committed. If `.env.demo` does not exist, the helper uses standard local Compose instead.

Current temporary URL (valid only while this tunnel runs):

```text
https://966b-194-207-252-2.ngrok-free.app/payments/webhook
```

Save this as the **Webhook URL in Paystack Test mode**, not as a callback URL. A callback redirects the buyer's browser; a webhook is Paystack calling our API. This webhook URL does not need to be in `.env`: Paystack stores it in its dashboard. No public key is needed by the existing server-initialized hosted checkout.

Only `POST /payments/webhook` is relayed. Login, wallet, Swagger and reconciliation routes are not exposed. The relay listens only at `127.0.0.1:4050`, forwards raw bytes and the signature without re-signing, accepts at most 100 KiB, uses a timeout, and preserves failure statuses for provider retries. Original HMAC verification, Paystack re-fetching and idempotent ledger credit remain in the API. Ngrok request inspection is disabled; the relay does not log bodies or signatures.

## Start again on Windows

Install Docker Desktop, Node 22/pnpm (see README) and the free ngrok CLI. If ngrok asks for account authentication, configure its agent using your own local ngrok account instructions; do not put its token in Git or chat.

1. Start Docker Desktop. Open PowerShell in this repository and keep your **test** secret in `PAYSTACK_SECRET_KEY` in `.env`.
2. Reload the API:

   ```powershell
   pnpm.cmd paystack:local
   ```

3. In a second PowerShell window, start the webhook-only relay and leave it running:

   ```powershell
   pnpm.cmd paystack:webhook
   ```

4. In another PowerShell window, start the tunnel and leave it running:

   ```powershell
   ngrok http http://127.0.0.1:4050 --inspect=false
   ```

5. Copy ngrok's HTTPS Forwarding address and append `/payments/webhook`. Save it in Paystack's **Test-mode webhook settings**. Restarting/changing a tunnel may change the URL; update Paystack whenever it changes.
6. Verify the tunnel using its actual address:

   ```powershell
   pnpm.cmd paystack:check https://YOUR-TUNNEL-HOST/payments/webhook
   ```

   Expected: test credentials accepted; webhook `200` for a harmless signed event; `401` for a forged signature; auth route `404`. This check does not create a payment or credit funds. Opening the webhook in a browser uses GET and intentionally returns `404`.

Stop the foreground relay and tunnel with Ctrl+C. While stopped, asleep or offline, the computer cannot receive webhooks. An always-on HTTPS deployment replaces the tunnel for production.

## Checks and remaining acceptance

- Existing focused provider/webhook suite: 19 passed, including concurrent triple delivery, signature/body tampering, provider verification and ledger idempotency in isolated test databases.
- New relay tests: exact-byte/signature preservation, blocked routes/methods, no forwarded auth credentials, oversized bodies and retryable upstream failures; two passed.
- Targeted ESLint/Prettier and root TypeScript check passed. No full-site tests were needed for these local setup helpers.
- Real test credentials and the current public tunnel passed the connection checks described above. No live keys or endpoints were used.

Still required: save the URL in Paystack, complete an actual hosted test payment (and DVA sandbox transfer for T06), verify the disclosed net wallet credit once after repeated event delivery, inspect reconciliation, and obtain human money/security review. Do not mark T06 complete based on the harmless connection check.

References: [Paystack webhooks](https://paystack.com/docs/payments/webhooks/), [ngrok agent inspection configuration](https://github.com/ngrok/ngrok-docs/blob/main/gateway/agent/config/v2.mdx), [existing Paystack funding contracts](paystack-topup.md).
