# Staff dashboard local setup

The local Docker staff website is `http://localhost:3301`. Staff use a separate email/password. Google Authenticator is optional per account. Buyer sign-in never grants staff access.

## First administrator

If an administrator already exists, use that staff account. Otherwise open PowerShell in the project directory and run:

```powershell
docker exec -it auction-ng-api-1 pnpm --filter api staff:setup
```

Enter the administrator name, a separate staff email and a password of at least 15 characters, then confirm the password. Sign in on the staff website with that email/password. You can enable or disable your own authenticator later in Account security. Keep passwords, setup keys and recovery codes private. The setup tool never promotes an existing buyer account.

The password stays invisible while typing. Use 15–128 characters; invalid lengths now produce a specific message before any account is created. A Docker notice that `../../.env` was not found is expected when configuration is injected into the container environment.

## Add team members

Open **Staff & roles**. Create a custom role if needed, then invite a member with the approved role and a reason. Share the private setup link securely with that person; it expires after 24 hours. They choose their own password. Authenticator setup is an optional personal action after sign-in. Reissuing an invitation for an unenrolled account invalidates its older links. Already-enrolled accounts cannot be replaced through invitations.

Admin alone controls staff/roles and permanent deletion. Manager defaults cover inventory, auctions and pickup; Support covers buyer assistance and conversations. Custom capabilities are checked by the API, not just navigation visibility. Assignment changes revoke existing sessions. The final active administrator cannot be removed.

## Configure item-photo storage later

Placeholders are present in private `.env` and `.env.demo`:

```dotenv
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_UPLOAD_BUCKET=
R2_PUBLIC_BUCKET=
R2_PUBLIC_URL=
```

Use a private incoming-upload bucket and a public processed-photo bucket. `R2_PUBLIC_URL` is the public HTTPS origin for processed photographs. Give the server credential only the required bucket access. Configure the incoming bucket's CORS to allow `PUT` from the staff-site origin and the content/checksum headers returned by the existing upload endpoint. Keep keys out of Git and chat. Restart/recreate API with the updated environment after entering the keys; merely editing a host file does not change a running Docker container's environment.

Save a draft, upload actual item photographs, then schedule its launch and close in WAT. The server verifies file size/type/checksum and generates bounded WebP derivatives. CSV imports accept the downloadable exact template, integer-kobo prices and up to 50 rows, with atomic rollback and retry identity. A draft without actual photos cannot be published through scheduling.

## Financial and archival controls

Full refunds of paid, uncollected invoices credit the original buyer wallet once, with a required reason and immutable audit/refund records. The dashboard does not promise an original-card refund. Collected goods and previously refunded invoices require separate review. Permanent deletion is limited to unused archived drafts and unassigned custom roles; linked transaction history stays archived.

## Acceptance still open

The automated twenty-draft import/retry/rollback test is passing, but it does not establish a warehouse operator's 20-items-in-15-minutes throughput. Actual R2 upload, camera workflow, end-to-end staff enrollment and final pickup/financial modal browser review remain required before T15 is marked done. No live Paystack operation was used in verification.
