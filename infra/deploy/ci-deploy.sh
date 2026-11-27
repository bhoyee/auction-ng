#!/usr/bin/env bash
# Forced command for the GitHub Actions deploy key (see docs/deploy.md).
# The key can only run this script; it accepts a branch name and nothing else.
# The first line of input is a short-lived, read-only registry token used to
# pull the image GitHub Actions built; it is never written to disk.
set -Eeuo pipefail
REF=${SSH_ORIGINAL_COMMAND:-main}
REF=${REF#deploy }
if [[ ! "$REF" =~ ^[A-Za-z0-9._/-]{1,100}$ ]]; then
  echo "Refusing ref: $REF" >&2
  exit 2
fi
REGISTRY_TOKEN=
IFS= read -r -t 10 REGISTRY_TOKEN || true
REGISTRY_TOKEN=${REGISTRY_TOKEN%$'\r'}
export REGISTRY_TOKEN
exec /opt/lotvanta/infra/deploy/deploy.sh "$REF" </dev/null
