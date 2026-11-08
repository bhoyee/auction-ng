#!/usr/bin/env bash
# One-time server preparation (run as root on Ubuntu with Docker installed).
# Clones the repo, creates .env.production with fresh secrets if missing, and
# installs the backup timers. Safe to re-run: never overwrites existing secrets.
set -Eeuo pipefail
APP_DIR=${APP_DIR:-/opt/lotvanta}
REPO=${REPO:-https://github.com/bhoyee/auction-ng.git}
BRANCH=${BRANCH:-main}

if [ ! -d "$APP_DIR/.git" ]; then
  git clone --quiet --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

if [ ! -f .env.production ]; then
  umask 077
  b64() { openssl rand -base64 32; }
  hex() { openssl rand -hex 32; }
  sed \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(hex)|" \
    -e "s|^DATA_ENCRYPTION_KEY=.*|DATA_ENCRYPTION_KEY=$(b64)|" \
    -e "s|^PII_HASH_KEY=.*|PII_HASH_KEY=$(b64)|" \
    -e "s|^RECONCILIATION_TOKEN=.*|RECONCILIATION_TOKEN=$(hex)|" \
    -e "s|^SEARCH_SYNC_TOKEN=.*|SEARCH_SYNC_TOKEN=$(hex)|" \
    -e "s|^BID_MAINTENANCE_TOKEN=.*|BID_MAINTENANCE_TOKEN=$(hex)|" \
    -e "s|^SUPPORT_DELIVERY_TOKEN=.*|SUPPORT_DELIVERY_TOKEN=$(hex)|" \
    -e "s|^MEILI_MASTER_KEY=.*|MEILI_MASTER_KEY=$(hex)|" \
    -e "s|^PAYSTACK_SECRET_KEY=.*|PAYSTACK_SECRET_KEY=|" \
    -e 's|[[:space:]]*#.*$||' \
    .env.production.example | grep -v '^$' > .env.production
  chmod 600 .env.production
  echo "Created $APP_DIR/.env.production with new random secrets."
fi

chmod +x infra/deploy/*.sh infra/backup/*.sh
install -m 0644 infra/deploy/systemd/lotvanta-*.service infra/deploy/systemd/lotvanta-*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now lotvanta-backup.timer lotvanta-restore-check.timer >/dev/null
echo "Backup timers: $(systemctl list-timers 'lotvanta-*' --no-legend | wc -l) active"
