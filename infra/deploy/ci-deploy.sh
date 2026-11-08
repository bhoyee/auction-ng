#!/usr/bin/env bash
# Forced command for the GitHub Actions deploy key (see docs/deploy.md).
# The key can only run this script; it accepts a branch name and nothing else.
set -Eeuo pipefail
REF=${SSH_ORIGINAL_COMMAND:-staging}
REF=${REF#deploy }
if [[ ! "$REF" =~ ^[A-Za-z0-9._/-]{1,100}$ ]]; then
  echo "Refusing ref: $REF" >&2
  exit 2
fi
exec /opt/lotvanta/infra/deploy/deploy.sh "$REF"
