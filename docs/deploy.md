# Deploying LotVanta (staging VPS)

Everything runs on one Ubuntu 24.04 VPS with Docker Compose. Caddy terminates
HTTPS and is the only container that publishes ports. The current server is
**staging**: Paystack test keys only, clean database, `noindex` headers.

## Hosts

| Host                | Serves                                                        |
| ------------------- | ------------------------------------------------------------- |
| `lotvanta.ng`       | Coming-soon page (`infra/coming-soon/`); `www` redirects here |
| `beta.lotvanta.ng`  | Buyer website (`apps/web`)                                    |
| `staff.lotvanta.ng` | Staff portal (`apps/admin`)                                   |
| `api.lotvanta.ng`   | API, plus `/socket.io/*` routed to the realtime gateway       |

Hostnames are settings in `.env.production` (`APEX_DOMAIN`, `WEB_DOMAIN`,
`STAFF_DOMAIN`, `API_DOMAIN`). The staff portal has its own host so its
HttpOnly refresh cookie and origin stay separate from buyers.

### DNS records (at the registrar)

Create these **A records**, all pointing at the server IP:

| Name    | Type | Value          |
| ------- | ---- | -------------- |
| `@`     | A    | `94.72.102.25` |
| `www`   | A    | `94.72.102.25` |
| `beta`  | A    | `94.72.102.25` |
| `staff` | A    | `94.72.102.25` |
| `api`   | A    | `94.72.102.25` |

Caddy requests Let's Encrypt certificates automatically once each name
resolves. Until then those hosts are unreachable by name.

## Server layout

| Path                                   | Purpose                                                 |
| -------------------------------------- | ------------------------------------------------------- |
| `/opt/lotvanta`                        | Git checkout (detached at the deployed commit)          |
| `/opt/lotvanta/.env.production`        | All settings and secrets (`chmod 600`, never committed) |
| `/var/backups/lotvanta`                | Local backups (14 days)                                 |
| `/etc/systemd/system/lotvanta-*.timer` | Daily backup, weekly restore check                      |

Server hardening already applied: ufw (22, 80, 443 only), unattended security
updates, fail2ban (sshd), 4 GB swap, Docker log rotation, UTC clock. Docker
bypasses ufw for published ports, so only Caddy may have `ports:` in
`docker-compose.prod.yml`.

> **Keep an offline copy of `.env.production`** in a password manager.
> Losing `DATA_ENCRYPTION_KEY` or `PII_HASH_KEY` makes encrypted personal data
> unreadable, even with a perfect database backup.

## First-time setup (fresh VPS)

1. Install Docker, ufw, fail2ban and unattended-upgrades (see hardening above).
2. As root: `curl -fsSL https://raw.githubusercontent.com/bhoyee/auction-ng/main/infra/deploy/bootstrap.sh | bash`
   This clones the repo to `/opt/lotvanta`, creates `.env.production` with
   fresh random secrets and enables the backup timers. Re-running it never
   overwrites existing secrets.
3. Edit `/opt/lotvanta/.env.production`: hostnames, Paystack **test** key,
   email settings (`AUTH_MODE=smtp` plus Resend/SMTP credentials).
4. Deploy: `/opt/lotvanta/infra/deploy/deploy.sh main`
5. Create the first staff administrator (interactive, never scripted):
   ```bash
   cd /opt/lotvanta
   docker compose -f docker-compose.prod.yml --env-file .env.production \
     exec api pnpm staff:setup
   ```

## Deploying

- **Automatic:** every push or merge to `main`. GitHub Actions
  (`.github/workflows/deploy-staging.yml`, "Deploy to VPS") connects over SSH
  and runs the deploy. Manual runs: Actions → Deploy to VPS → Run workflow.
- **By hand on the server:** `/opt/lotvanta/infra/deploy/deploy.sh main`
  (or any other branch / commit SHA).

`deploy.sh` fetches the ref, builds one image tagged with the commit,
starts data services, **backs up the database**, applies Prisma migrations,
then restarts the apps and waits for every health check. Only one deploy can
run at a time.

### CI access (one-time)

The workflow needs two secrets in the `staging` GitHub environment (the
server's public host key is pinned in the workflow file itself):

| Secret                | Value                                  |
| --------------------- | -------------------------------------- |
| `STAGING_HOST`        | Server IP                              |
| `STAGING_SSH_KEY`     | Private half of a dedicated deploy key |

Add the public half to `/root/.ssh/authorized_keys` **pinned to the deploy
script**, so the key cannot open a shell:

```text
command="/opt/lotvanta/infra/deploy/ci-deploy.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... github-actions-staging-deploy
```

### Rolling back

Images are tagged by commit (`lotvanta-app:<sha>`). Redeploy an earlier
commit: `deploy.sh <commit-sha>`. Database migrations are forward-only; if a
migration must be undone, restore the pre-deploy backup (below).

## Backups and restore

- **Daily** at 02:30 WAT: `infra/backup/backup.sh` writes a PostgreSQL
  custom-format dump (verified with `pg_restore --list`, SHA-256 recorded) and
  a Redis snapshot to `/var/backups/lotvanta`, keeping 14 days.
- **Before every deploy** a `pre-deploy` backup is taken.
- **Weekly** (Sunday 04:00 WAT): `restore.sh check` restores the newest dump
  into a scratch database, checks tables and migrations, then drops it.
- **Off-site:** set `BACKUP_R2_BUCKET`, `BACKUP_R2_ACCESS_KEY_ID`,
  `BACKUP_R2_SECRET_ACCESS_KEY` and `R2_ACCOUNT_ID` (a **private** Cloudflare R2
  bucket with an API token scoped to it). Each backup is then uploaded too.
  Until then backups exist only on this server.

Commands:

```bash
/opt/lotvanta/infra/backup/backup.sh manual          # back up now
/opt/lotvanta/infra/backup/restore.sh check          # test-restore newest dump
/opt/lotvanta/infra/backup/restore.sh replace <file> # replace live DB (asks to type RESTORE)
systemctl list-timers 'lotvanta-*'                   # next scheduled runs
journalctl -u lotvanta-backup -n 50                  # last backup log
```

## Useful commands

```bash
cd /opt/lotvanta
C="docker compose -f docker-compose.prod.yml --env-file .env.production"
$C ps                       # status and health
$C logs -f --tail=100 api   # follow one service
$C restart worker           # restart one service
cat .deployed-version       # commit currently running
```

## Going to production later

Before real money: Paystack live keys set by the owner, `DEPLOYMENT_ENV=production`,
`ROBOTS_TAG=all`, R2 off-site backups confirmed, the money/bid reviews flagged
in `docs/TASKS.md` completed, and T18 (monitoring) and T20 (security pass) done.
