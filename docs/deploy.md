# Deploying GiddyDeal (staging VPS)

Everything runs on one Ubuntu 24.04 VPS with Docker Compose. Caddy terminates
HTTPS and is the only container that publishes ports. The current server is
**staging**: Paystack test keys only, clean database, `noindex` headers.

## Hosts

| Host                 | Serves                                                        |
| -------------------- | ------------------------------------------------------------- |
| `giddydeal.ng`       | Coming-soon page (`infra/coming-soon/`); `www` redirects here |
| `beta.giddydeal.ng`  | Buyer website (`apps/web`)                                    |
| `staff.giddydeal.ng` | Staff portal (`apps/admin`)                                   |
| `api.giddydeal.ng`   | API, plus `/socket.io/*` routed to the realtime gateway       |

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

### Old domain (lotvanta.ng)

The marketplace was renamed from LotVanta to GiddyDeal on 2026-11-20. With
`LEGACY_DOMAIN=lotvanta.ng`, Caddy answers the old hosts too: `lotvanta.ng`,
`www`, `beta` and `staff` send a permanent (301) redirect to the same path on
the matching new host, and `api.lotvanta.ng` keeps serving the API so payment
webhooks and older app builds still work. Keep the old A records pointing at
the server for as long as the redirects are wanted. Server internals (the
`/opt/lotvanta` checkout, `lotvanta` Docker project, image, volumes, database
name/user and `lotvanta-*` timers) keep the original name on purpose:
renaming them would orphan the live data.

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
   email settings (`AUTH_MODE=smtp` plus Resend/SMTP credentials), and
   optionally `ADMIN_WHATSAPP_PHONE` + `CALLMEBOT_API_KEY` for the admin's
   WhatsApp sale alerts (off when either is empty).
4. Deploy: `/opt/lotvanta/infra/deploy/deploy.sh main`
5. Create the first staff administrator (interactive, never scripted):
   ```bash
   cd /opt/lotvanta
   docker compose -f docker-compose.prod.yml --env-file .env.production \
     exec api pnpm staff:setup
   ```

## Deploying

- **Automatic:** every push or merge to `main`. GitHub Actions
  (`.github/workflows/deploy.yml`, "Deploy to VPS") connects over SSH
  and runs the deploy. Manual runs: Actions → Deploy to VPS → Run workflow.
- **By hand on the server:** `/opt/lotvanta/infra/deploy/deploy.sh <ref>`
  works only for a commit whose image is already on the server (rollback to
  one of the last three). Anything else: run the GitHub workflow.
- **Emergency (GitHub down):** `BUILD_ON_SERVER=1 deploy.sh main` builds on
  the server. This loads the live server heavily (see below); use it only at
  a quiet time.

**Images are never built on the live server (2026-11-27).** Building used
every core and the disk for minutes; on 2026-11-27 the server froze mid-build
and was offline for 90 minutes. The workflow's `image` job builds the image on
GitHub and pushes it to `ghcr.io/bhoyee/auction-ng-app:<commit>`. The
`deploy` job then passes its short-lived, read-only token over SSH; the
server uses it once to download the image (never stored) and tags it
`lotvanta-app:<short sha>`. Layers are cached in the registry, so a code-only
change downloads about 110 MB; a `pnpm-lock.yaml` change downloads the 2.1 GB
packages layer again. Pull requests that change the Dockerfile, deploy
scripts or lockfile build the image without pushing it.

The public URLs compiled into the web apps come from the repository variables
`API_DOMAIN`, `WEB_DOMAIN` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Settings →
Secrets and variables → Actions → Variables). They must match
`.env.production`; `deploy.sh` refuses an image built for other domains.

`deploy.sh` checks out the commit, downloads its image, starts data services,
**backs up the database**, applies Prisma migrations, then restarts the apps
one at a time (api, realtime, web, admin, worker), waiting for each health
check. Only one deploy can run at a time.

Keeping buyers unaffected (2026-11-21):

- The server only downloads and unpacks the changed layers; it never compiles.
- Each app is replaced on its own, so the buyer site is back within seconds,
  and Caddy holds requests while an app restarts (`wait_for_restart`, up to
  30 s, retrying only failed connections) instead of showing an error.
- Old images are removed after each deploy, keeping the running version and
  the two before it.
- Merge to `main` (which deploys) outside busy buying hours.

### CI access (one-time)

The workflow needs two secrets in the `production` GitHub environment (the
server's public host key is pinned in the workflow file itself):

| Secret           | Value                                  |
| ---------------- | -------------------------------------- |
| `DEPLOY_HOST`    | Server IP                              |
| `DEPLOY_SSH_KEY` | Private half of a dedicated deploy key |

Add the public half to `/root/.ssh/authorized_keys` **pinned to the deploy
script**, so the key cannot open a shell:

```text
command="/opt/lotvanta/infra/deploy/ci-deploy.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... github-actions-staging-deploy
```

### Rolling back

Images are tagged by commit (`lotvanta-app:<sha>`); the last three are kept
on the server and every one stays in GHCR. Redeploy an earlier commit:
Actions → Deploy to VPS → Run workflow with the commit SHA (it reuses the
registry cache), or `deploy.sh <commit-sha>` on the server if that image is
still there. Database migrations are forward-only; if a migration must be
undone, restore the pre-deploy backup (below).

## Uptime watchdog

`.github/workflows/watchdog.yml` checks `https://<API_DOMAIN>/health` every
5 minutes from GitHub, outside the server (`infra/deploy/watchdog.sh`):

- Healthy, or recovered within 5 minutes: nothing happens.
- Failing for 5 minutes: the run fails and **GitHub emails the repository
  owner** (make sure Settings → Notifications → Actions → "Failed workflows
  only" is on for email).
- If Cloudflare cannot reach the machine at all (HTTP 522/523), no deploy is
  running and there was no automatic restart in the last hour, it restarts
  the server through the Contabo API and waits up to 10 minutes for it to
  come back. An unhealthy app on a reachable server is only reported.
- GitHub pauses scheduled workflows after 60 days without repository
  activity; re-enable it under Actions if that happens.

Automatic restart needs a Contabo API client (Contabo panel → API): repository
secrets `CONTABO_CLIENT_ID`, `CONTABO_CLIENT_SECRET`, `CONTABO_API_USER`,
`CONTABO_API_PASSWORD`, and the variable `CONTABO_INSTANCE_NAME` (`vmi…`).
Check them without changing anything: Actions → Uptime watchdog → Run
workflow → `test-contabo`.

Logs survive a hard reset: `infra/deploy/systemd/journald-lotvanta.conf`
flushes the journal every 15 s. After an incident:
`journalctl -b -1 -n 200 --no-pager` (previous boot) and
`sar -u -r -b -f /var/log/sysstat/saDD` (CPU, memory and disk every 10 minutes).

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
