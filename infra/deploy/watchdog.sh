#!/usr/bin/env bash
# Run by .github/workflows/watchdog.yml every 5 minutes, outside the server,
# so it still works when the server is frozen (2026-11-27: 90 minutes offline
# before anyone noticed). Exit 0 = healthy; anything else fails the run and
# GitHub emails the repository owner.
#
# It restarts the server through the Contabo API only when Cloudflare cannot
# reach the machine at all (522/523) for 5 minutes in a row, no deploy is
# running, and no automatic restart happened in the last hour. A reachable
# server with an unhealthy app is only reported: Docker restarts crashed
# services, and a reboot would not fix a bad deploy.
#
# Inputs (environment): HEALTH_URL, DEPLOY_RUNNING, RECENT_RESTART, MODE
# (check | test-contabo), and optionally CONTABO_CLIENT_ID,
# CONTABO_CLIENT_SECRET, CONTABO_API_USER, CONTABO_API_PASSWORD,
# CONTABO_INSTANCE_NAME. Writes ./watchdog-restarted after a restart.
set -Euo pipefail
URL=${HEALTH_URL:-https://api.giddydeal.ng/health}
MODE=${MODE:-check}

status() { curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$URL" || true; }
now() { date -u +%H:%M:%S; }

contabo_token() {
  curl -fsS --max-time 30 https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token \
    -d grant_type=password \
    --data-urlencode "client_id=$CONTABO_CLIENT_ID" \
    --data-urlencode "client_secret=$CONTABO_CLIENT_SECRET" \
    --data-urlencode "username=$CONTABO_API_USER" \
    --data-urlencode "password=$CONTABO_API_PASSWORD" | jq -er .access_token
}
contabo() { # method path
  curl -fsS --max-time 30 -X "$1" "https://api.contabo.com/v1$2" \
    -H "Authorization: Bearer $TOKEN" -H "x-request-id: $(cat /proc/sys/kernel/random/uuid)" \
    -H 'Content-Type: application/json'
}
contabo_instance() {
  contabo GET "/compute/instances?name=$CONTABO_INSTANCE_NAME" |
    jq -er --arg n "$CONTABO_INSTANCE_NAME" '[.data[] | select(.name == $n)] | if length == 1 then .[0].instanceId else error("instance not found") end'
}
have_contabo() {
  [[ -n "${CONTABO_CLIENT_ID:-}" && -n "${CONTABO_CLIENT_SECRET:-}" && -n "${CONTABO_API_USER:-}" \
    && -n "${CONTABO_API_PASSWORD:-}" && -n "${CONTABO_INSTANCE_NAME:-}" ]]
}

if [[ "$MODE" == test-contabo ]]; then
  have_contabo || { echo "::error::Contabo secrets are not all set."; exit 1; }
  TOKEN=$(contabo_token) || { echo "::error::Contabo sign-in failed. Check the API client and user."; exit 1; }
  id=$(contabo_instance) || { echo "::error::Signed in, but $CONTABO_INSTANCE_NAME was not found."; exit 1; }
  state=$(contabo GET "/compute/instances/$id" | jq -r '.data[0].status')
  echo "Contabo access works: $CONTABO_INSTANCE_NAME (id $id) is $state. Nothing was changed."
  exit 0
fi

code=$(status)
[[ "$code" == 200 ]] && { echo "$(now) healthy"; exit 0; }

# Confirm for 5 minutes, so a blip or a deploy restart never triggers anything.
echo "$(now) health check returned $code; confirming for 5 minutes"
for _ in $(seq 10); do
  sleep 30
  code=$(status)
  echo "$(now) $code"
  [[ "$code" == 200 ]] && { echo "Recovered by itself."; exit 0; }
done

if [[ "$code" != 522 && "$code" != 523 ]]; then
  echo "::error::$URL has failed for 5 minutes (HTTP $code), but the server is reachable. An app is unhealthy: check the containers (docs/deploy.md)."
  exit 1
fi
if [[ "${DEPLOY_RUNNING:-}" == true ]]; then
  echo "::error::Server unreachable (HTTP $code) while a deploy is running; not restarting during a deploy. Check the Deploy to VPS run."
  exit 1
fi
if [[ "${RECENT_RESTART:-}" == true ]]; then
  echo "::error::Server still unreachable (HTTP $code) after an automatic restart within the last hour. A person is needed: Contabo panel → VNC console, or open a Contabo ticket."
  exit 1
fi
if ! have_contabo; then
  echo "::error::Server unreachable (HTTP $code) for 5 minutes. Restart it from the Contabo panel (automatic restart is not set up)."
  exit 1
fi

echo "$(now) server unreachable for 5 minutes; restarting it through the Contabo API"
TOKEN=$(contabo_token) || { echo "::error::Server unreachable and Contabo sign-in failed; restart it from the Contabo panel."; exit 1; }
id=$(contabo_instance) || { echo "::error::Server unreachable and the Contabo instance was not found; restart it from the Contabo panel."; exit 1; }
contabo POST "/compute/instances/$id/actions/restart" >/dev/null ||
  { echo "::error::Server unreachable and the Contabo restart request failed; restart it from the Contabo panel."; exit 1; }
date -u +%FT%TZ > watchdog-restarted

for _ in $(seq 20); do
  sleep 30
  code=$(status)
  if [[ "$code" == 200 ]]; then
    echo "::error::The server was frozen and has been restarted automatically; it is back online at $(now) UTC. Check the logs for the cause (docs/deploy.md)."
    exit 1
  fi
done
echo "::error::The server was restarted automatically but is still not answering (HTTP $code) after 10 minutes. Open the Contabo VNC console or a Contabo ticket."
exit 1
