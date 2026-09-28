#!/bin/bash
# Brings this checkout to the latest main and rebuilds the helper when it changed.
# Run by hand or every five minutes by the auto-update agent (./auto-update.sh on).
# Chrome notices the new files within a minute and reloads the extension by itself.
# Never touches a checkout that is on another branch, has local changes or has diverged.
set -euo pipefail

cd "$(dirname "$0")"
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" != "main" ]]; then
  log "skipped: on branch $branch"
  exit 0
fi
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  log "skipped: local changes"
  exit 0
fi
if ! git fetch --quiet origin main; then
  log "skipped: fetch failed (offline?)"
  exit 0
fi

before="$(git rev-parse HEAD)"
if ! git merge --ff-only --quiet origin/main; then
  log "skipped: local main has diverged from origin/main"
  exit 0
fi
after="$(git rev-parse HEAD)"
[[ "$before" == "$after" ]] && exit 0

log "updated ${before:0:7} → ${after:0:7}"
if ! git diff --quiet "$before" "$after" -- host install.sh manifest.json; then
  log "helper changed, rebuilding"
  ./install.sh
fi
