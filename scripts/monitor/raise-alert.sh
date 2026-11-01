#!/usr/bin/env bash
# Usage: raise-alert.sh <label> <title> <message>
# Env: GH_TOKEN, OWNER, REPO, RUN_URL
#
# The alert must reach a person, not only sit as an open issue: a new alert is
# assigned to OWNER (GitHub notifies the assignee), and an alert that is still
# failing gets one reminder comment per 24 hours, counted from the latest
# reminder or from the issue's creation. Runs in between only update the issue
# text, which sends no notification.
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "Usage: raise-alert.sh <label> <title> <message>" >&2
  exit 2
fi
label="$1"
title="$2"
message="$3"
: "${OWNER:?OWNER is required}" "${REPO:?REPO is required}" "${RUN_URL:?RUN_URL is required}"

now="$(date -u +%Y-%m-%dT%H:%MZ)"
gh label create "$label" --color B60205 --description "Automatisk alarm" --force >/dev/null

found="$(gh issue list --repo "$REPO" --label "$label" --state open --limit 1 \
  --json number,createdAt --jq '.[0] | select(. != null) | "\(.number) \(.createdAt)"')"

if [[ -z "$found" ]]; then
  gh issue create --repo "$REPO" \
    --title "$title" \
    --label "$label" \
    --assignee "$OWNER" \
    --body "@$OWNER $message ($now). Se kørslen: $RUN_URL"
  exit 0
fi

number="${found%% *}"
created_at="${found#* }"
gh issue edit "$number" --repo "$REPO" --add-assignee "$OWNER" >/dev/null || true

last="$(gh api --paginate "repos/$REPO/issues/$number/comments" \
  --jq '.[] | select(.body | startswith("Påmindelse")) | .created_at' | sort | tail -n 1)"
base="${last:-$created_at}"

if (( $(date -u +%s) - $(date -u -d "$base" +%s) > 86400 )); then
  gh issue comment "$number" --repo "$REPO" \
    --body "Påmindelse til @$OWNER: $message ($now). Se kørslen: $RUN_URL"
else
  gh issue edit "$number" --repo "$REPO" \
    --body "@$OWNER $message (seneste fejl $now). Se kørslen: $RUN_URL"
fi
