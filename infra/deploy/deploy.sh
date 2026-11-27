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
FULL_SHA=$(git rev-parse HEAD)
IMAGE_REPO=${IMAGE_REPO:-ghcr.io/bhoyee/auction-ng-app}
REGISTRY_CONFIG=
trap '[[ -n "$REGISTRY_CONFIG" ]] && rm -rf "$REGISTRY_CONFIG"' EXIT

# GitHub Actions builds the image; this server only downloads it. Building
# here used every core and the disk for minutes, and on 2026-11-27 the server
# froze mid-build and stayed offline for 90 minutes. BUILD_ON_SERVER=1 is an
# emergency fallback only (for example, when GitHub is down).
if docker image inspect "lotvanta-app:$APP_VERSION" >/dev/null 2>&1; then
  log "lotvanta-app:$APP_VERSION is already on this server ($(git log -1 --format='%s'))"
elif [[ -n "${REGISTRY_TOKEN:-}" ]]; then
  log "Downloading $IMAGE_REPO:$FULL_SHA ($(git log -1 --format='%s'))"
  REGISTRY_CONFIG=$(mktemp -d)
  printf '%s' "$REGISTRY_TOKEN" |
    docker --config "$REGISTRY_CONFIG" login ghcr.io -u deploy --password-stdin >/dev/null
  docker --config "$REGISTRY_CONFIG" pull --quiet "$IMAGE_REPO:$FULL_SHA" >/dev/null
  rm -rf "$REGISTRY_CONFIG"
  REGISTRY_CONFIG=
  docker tag "$IMAGE_REPO:$FULL_SHA" "lotvanta-app:$APP_VERSION"
  docker image rm "$IMAGE_REPO:$FULL_SHA" >/dev/null
elif [[ "${BUILD_ON_SERVER:-}" == 1 ]]; then
  log "Building lotvanta-app:$APP_VERSION on this server (BUILD_ON_SERVER=1; heavy load)"
  "${C[@]}" build api
else
  echo "No image for $APP_VERSION here. Deploy from GitHub (Actions → Deploy to VPS →" \
    "Run workflow), or in an emergency run BUILD_ON_SERVER=1 $0 $REF" >&2
  exit 1
fi

# Public URLs are compiled into the image; refuse one built for other domains.
image_label() {
  docker image inspect -f "{{ index .Config.Labels \"ng.giddydeal.$1\" }}" "lotvanta-app:$APP_VERSION"
}
env_value() { sed -n "s/^$1=//p" .env.production | tail -n 1 | tr -d '\r"'; }
for pair in api-domain:API_DOMAIN web-domain:WEB_DOMAIN; do
  built=$(image_label "${pair%%:*}")
  wanted=$(env_value "${pair#*:}")
  if [[ -n "$built" && "$built" != "$wanted" ]]; then
    echo "Image was built for ${pair#*:}=$built but this server uses $wanted." \
      "Update the GitHub repository variable and deploy again." >&2
    exit 1
  fi
done

log "Starting data services"
"${C[@]}" up -d --no-build --wait postgres redis meilisearch

if "${C[@]}" exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select 1 from _prisma_migrations limit 1"' >/dev/null 2>&1; then
  log "Backing up before migration"
  "$APP_DIR/infra/backup/backup.sh" pre-deploy
fi

log "Applying database migrations"
"${C[@]}" run --rm --no-deps -T api pnpm --filter api db:migrate

log "Starting application"
# One service at a time (2026-11-21): the buyer site is replaced on its own
# and is back within seconds, instead of staying down until every other app
# is healthy. Caddy holds requests meanwhile (wait_for_restart).
for service in api realtime web admin worker; do
  "${C[@]}" up -d --no-build --no-deps --wait "$service"
done
"${C[@]}" up -d --no-build --wait --remove-orphans

# Caddy mounts infra/Caddyfile as a single file. The checkout above replaces
# that file, so the running container keeps the old copy; recreate Caddy only
# when its live config differs. Certificates persist in the caddy-data volume.
if ! "${C[@]}" exec -T caddy cat /etc/caddy/Caddyfile 2>/dev/null | cmp -s - infra/Caddyfile; then
  log "Applying the changed Caddy configuration"
  "${C[@]}" run --rm --no-deps -T --entrypoint caddy caddy \
    validate --config /etc/caddy/Caddyfile --adapter caddyfile
  "${C[@]}" up -d --no-build --no-deps --force-recreate caddy
fi

echo "$APP_VERSION" > "$APP_DIR/.deployed-version"
docker image prune -f >/dev/null
# Keep the running version plus the two before it for quick rollback
# (deploy.sh <commit>; older ones are downloaded again), so deploys never
# fill the disk (2026-11-21: 24 old images had piled up). The build cache
# only exists after an emergency BUILD_ON_SERVER deploy.
docker images lotvanta-app --format '{{.CreatedAt}}\t{{.Tag}}' | sort -r |
  awk -F'\t' -v keep="$APP_VERSION" '$2 != keep { print $2 }' | tail -n +3 |
  while read -r tag; do docker image rm "lotvanta-app:$tag" >/dev/null 2>&1 || true; done
docker builder prune -f --max-used-space 10gb >/dev/null 2>&1 || true
log "Deployed $APP_VERSION"
"${C[@]}" ps --format 'table {{.Service}}\t{{.Status}}'
