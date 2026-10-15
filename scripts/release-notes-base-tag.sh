#!/usr/bin/env bash
set -euo pipefail

release_tag="${1:-}"
if [[ ! "$release_tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo 'Release tag must use vMAJOR.MINOR.PATCH.' >&2
  exit 2
fi

# v2.0.0's GitHub body was replaced during a later asset attachment. Backfill
# v2.1.0 from the last release whose published body still has its notes, then
# resume the normal latest-release baseline.
if [[ "$release_tag" == "v2.1.0" ]]; then
  printf '%s\n' 'v1.11.0'
else
  exec "$(dirname "$0")/latest-published-release-tag.sh" "$release_tag"
fi
