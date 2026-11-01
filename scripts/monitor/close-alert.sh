#!/usr/bin/env bash
# Usage: close-alert.sh <label> <message>
# Env: GH_TOKEN, REPO, RUN_URL
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: close-alert.sh <label> <message>" >&2
  exit 2
fi
label="$1"
message="$2"
: "${REPO:?REPO is required}" "${RUN_URL:?RUN_URL is required}"

number="$(gh issue list --repo "$REPO" --label "$label" --state open --limit 1 \
  --json number --jq '.[0].number // empty')"
if [[ -n "$number" ]]; then
  gh issue close "$number" --repo "$REPO" --comment "$message Se kørslen: $RUN_URL"
fi
