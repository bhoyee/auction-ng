#!/usr/bin/env bash
# Restore a PostgreSQL backup.
#   restore.sh check [dump]    Restore into a scratch database, verify, drop it.
#                              Default dump: the newest one. Safe; runs weekly.
#   restore.sh replace <dump>  Replace the live database (asks for confirmation).
set -Eeuo pipefail
APP_DIR=${APP_DIR:-/opt/lotvanta}
DIR=${BACKUP_DIR:-/var/backups/lotvanta}
MODE=${1:-check}
DUMP=${2:-$(ls -1t "$DIR"/postgres-*.dump 2>/dev/null | head -1 || true)}
cd "$APP_DIR"
C=(docker compose -f docker-compose.prod.yml --env-file .env.production)
psql_c() { "${C[@]}" exec -T postgres sh -c "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d ${1} -Atc \"${2}\""; }

[ -f "$DUMP" ] || { echo "No backup file found: ${DUMP:-none}" >&2; exit 1; }
if [ -f "$DUMP.sha256" ]; then sha256sum --quiet -c "$DUMP.sha256"; fi

if [ "$MODE" = check ]; then
  SCRATCH=restore_check_$(date -u +%s)
  psql_c postgres "CREATE DATABASE $SCRATCH"
  trap 'psql_c postgres "DROP DATABASE IF EXISTS $SCRATCH" >/dev/null' EXIT
  "${C[@]}" exec -T postgres sh -c "pg_restore -U \"\$POSTGRES_USER\" -d $SCRATCH --no-owner --exit-on-error" < "$DUMP"
  TABLES=$(psql_c "$SCRATCH" "select count(*) from information_schema.tables where table_schema='public'")
  MIGRATIONS=$(psql_c "$SCRATCH" "select count(*) from _prisma_migrations where finished_at is not null")
  [ "$TABLES" -gt 10 ] && [ "$MIGRATIONS" -gt 0 ] || { echo "Restore check FAILED: $TABLES tables, $MIGRATIONS migrations" >&2; exit 1; }
  echo "Restore check passed: $(basename "$DUMP") -> $TABLES tables, $MIGRATIONS migrations"
  exit 0
fi

if [ "$MODE" = replace ]; then
  echo "This REPLACES the live database with $(basename "$DUMP")."
  echo "A fresh backup of the current database is taken first."
  read -r -p "Type RESTORE to continue: " answer
  [ "$answer" = RESTORE ] || { echo "Cancelled."; exit 1; }
  "$APP_DIR/infra/backup/backup.sh" pre-restore
  "${C[@]}" stop web admin api realtime worker
  "${C[@]}" exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
  "${C[@]}" exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error' < "$DUMP"
  "${C[@]}" run --rm --no-deps -T api pnpm --filter api db:migrate
  "${C[@]}" up -d --no-build --wait
  echo "Live database restored from $(basename "$DUMP")."
  exit 0
fi
echo "Usage: restore.sh check [dump] | restore.sh replace <dump>" >&2
exit 2
