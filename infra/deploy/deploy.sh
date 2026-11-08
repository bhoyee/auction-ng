#!/usr/bin/env bash
# Deploy a branch or commit on the VPS: fetch, build one image, back up,
# migrate, then restart. Usage: deploy.sh [branch-or-commit]  (default: main)
set -Eeuo pipefail
APP_DIR=${APP_DIR:-/opt/lotvanta}
REF=${1:-main}
cd "$APP_DIR"

if [[ ! "$REF" =~ ^[A-Za-z0-9._/-]{1,100}$ ]]; then
  echo "Invalid ref: $REF" >&2
  exit 2
fi
exec 9>/var/lock/lotvanta-deploy.lock
flock -n 9 || { echo "Another deploy is running." >&2; exit 1; }

C=(docker compose -f docker-compose.prod.yml --env-file .env.production)
log() { printf '\n[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

log "Fetching $REF"
git fetch --prune --quiet origin
if git rev-parse --verify --quiet "origin/$REF" >/dev/null; then
  git checkout --quiet --force --detach "origin/$REF"
else
  git checkout --quiet --force --detach "$REF"
fi
export APP_VERSION
APP_VERSION=$(git rev-parse --short=12 HEAD)
log "Building lotvanta-app:$APP_VERSION ($(git log -1 --format='%s'))"
"${C[@]}" build api

log "Starting data services"
"${C[@]}" up -d --no-build --wait postgres redis meilisearch

if "${C[@]}" exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select 1 from _prisma_migrations limit 1"' >/dev/null 2>&1; then
  log "Backing up before migration"
  "$APP_DIR/infra/backup/backup.sh" pre-deploy
fi

log "Applying database migrations"
"${C[@]}" run --rm --no-deps -T api pnpm --filter api db:migrate

log "Starting application"
"${C[@]}" up -d --no-build --wait --remove-orphans

echo "$APP_VERSION" > "$APP_DIR/.deployed-version"
docker image prune -f >/dev/null
log "Deployed $APP_VERSION"
"${C[@]}" ps --format 'table {{.Service}}\t{{.Status}}'
