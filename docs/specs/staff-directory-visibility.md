# Server-managed staff directory visibility

Owner-approved, 2026-11-26. An existing administrator may be excluded from the ordinary Staff directory while retaining normal sign-in, role permissions and attributable audit history. This does not create a Super Admin role or bypass financial approval, session, password or MFA rules. Other administrators remain visible by default.

## Storage and readers

`users.hidden_from_staff_directory` is a non-null boolean, default false. Migration `20261126100000_staff_directory_visibility` adds the column and `users_staff_directory_idx (hidden_from_staff_directory, role, id)`. Existing IDs, relations, credentials and memberships are unchanged; there is no new unique constraint. No email address is hard-coded in code or migrations, and deployment does not hide any account automatically.

Staff records filter the flag in PostgreSQL before search, keyset pagination and response construction, for active and archived views. Global staff search uses the same reader, as do consumers of its record pages. There is no separate staff-export endpoint at present. Role display counts exclude hidden memberships, but Admin remains visible and actual role membership/safe-deletion/last-admin checks still include all accounts. Audit actors, operational attribution and the signed-in account's own profile are not filtered. This is directory privacy, not an untraceable account; someone with audit permissions may still see its actions and identity.

## Server command

After deployment and migration, open the existing server terminal and run:

```sh
cd /opt/lotvanta
docker compose -f docker-compose.prod.yml --env-file .env.production exec api pnpm --filter api staff:directory
```

The command requires an interactive terminal, an active administrator's email/password and authenticator code when enabled. Password/code input is hidden, readline history is disabled, and credentials must never be passed as command-line arguments or through chat. It creates a short-lived operator sign-in using existing authentication/rate limits and revokes that command's session on exit; other sessions are retained.

Enter the existing target administrator's email, choose `HIDE` or `SHOW`, provide a reason, then type `CONFIRM`. The service rechecks current administrator access and session/MFA proof in the transaction, serializes with existing staff administration and records an encrypted before/after audit under the actual operator. Repeating the current setting is a no-op. `SHOW` restores directory visibility. No public endpoint or UI toggle can change the flag.

The command refuses missing accounts, buyers and accounts without administrator staff credentials. It never creates/promotes an account or changes a password. If the account does not yet exist, provision it using the existing interactive `staff:setup` command first; never change a buyer into an administrator by editing the database. Production credentials must be entered by the operator, not supplied in an agent conversation.

## Validation

Focused staff-admin integration tests use a freshly migrated isolated PostgreSQL database. They verify directory search/pagination, role display counts, unchanged access, MFA-protected sign-in, audit identity, safe retries/restoration, strict input validation and rejection of unauthorized or expired operators. Existing staff safety tests run alongside them. No money or bidding implementation changes and no dependencies or new environment variables.
