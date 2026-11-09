#!/usr/bin/env bash
# PostgreSQL (and Redis snapshot) backup. Keeps 14 days locally and uploads to
# Cloudflare R2 when BACKUP_R2_* settings exist. Usage: backup.sh [label]
set -Eeuo pipefail
APP_DIR=${APP_DIR:-/opt/lotvanta}
DIR=${BACKUP_DIR:-/var/backups/lotvanta}
LABEL=${1:-daily}
KEEP_DAYS=${BACKUP_KEEP_DAYS:-14}
cd "$APP_DIR"
C=(docker compose -f docker-compose.prod.yml --env-file .env.production)
setting() { grep -E "^$1=" .env.production | tail -1 | cut -d= -f2- | tr -d '"\r'; }

umask 077
mkdir -p "$DIR"
TS=$(date -u +%Y%m%dT%H%M%SZ)
DUMP="$DIR/postgres-$TS-$LABEL.dump"

"${C[@]}" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner' > "$DUMP.partial"
# A dump that pg_restore cannot list is not a backup.
"${C[@]}" exec -T postgres pg_restore --list < "$DUMP.partial" > /dev/null
mv "$DUMP.partial" "$DUMP"
sha256sum "$DUMP" > "$DUMP.sha256"

if "${C[@]}" exec -T redis redis-cli --rdb /data/backup.rdb > /dev/null 2>&1; then
  "${C[@]}" cp redis:/data/backup.rdb "$DIR/redis-$TS-$LABEL.rdb" > /dev/null
fi

find "$DIR" -type f -mtime +"$KEEP_DAYS" -name 'postgres-*' -delete
find "$DIR" -type f -mtime +"$KEEP_DAYS" -name 'redis-*' -delete

BUCKET=$(setting BACKUP_R2_BUCKET || true)
if [ -n "$BUCKET" ]; then
  ACCOUNT=$(setting R2_ACCOUNT_ID)
  docker run --rm -v "$DIR:/backups:ro" \
    -e AWS_ACCESS_KEY_ID="$(setting BACKUP_R2_ACCESS_KEY_ID)" \
    -e AWS_SECRET_ACCESS_KEY="$(setting BACKUP_R2_SECRET_ACCESS_KEY)" \
    -e AWS_DEFAULT_REGION=auto \
    amazon/aws-cli:2.27.50 s3 cp "/backups/$(basename "$DUMP")" \
    "s3://$BUCKET/postgres/$(basename "$DUMP")" \
    --endpoint-url "https://$ACCOUNT.r2.cloudflarestorage.com" --only-show-errors
  echo "Uploaded $(basename "$DUMP") to R2 bucket $BUCKET"
else
  echo "R2 not configured: backup kept on this server only." >&2
fi
echo "Backup written: $DUMP ($(du -h "$DUMP" | cut -f1))"
