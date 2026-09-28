#!/bin/bash
# Brings this checkout to the latest main and rebuilds the helper when its sources changed.
# Run by hand or every five minutes by the auto-update agent (./auto-update.sh on).
# Chrome notices the new files within a minute and reloads the extension by itself.
# Never touches a checkout that is on another branch, has local changes or has diverged.
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"

# One run at a time (the agent and a manual run could overlap).
if [[ -z "${PAPER_CLIPPER_LOCKED:-}" ]]; then
  lock="$(git rev-parse --git-dir)/paper-clipper-update.lock"
  exec env PAPER_CLIPPER_LOCKED=1 lockf -s -t 0 "$lock" "$ROOT/update.sh" "$@"
fi

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
remote="$(git rev-parse FETCH_HEAD)"
if [[ "$before" != "$remote" ]]; then
  if ! git merge-base --is-ancestor HEAD FETCH_HEAD; then
    log "skipped: local main has commits that are not on GitHub"
    exit 0
  fi
  if ! output="$(git merge --ff-only --quiet FETCH_HEAD 2>&1)"; then
    log "skipped: update failed: $output"
    exit 0
  fi
  log "updated ${before:0:7} → ${remote:0:7}"
fi

# Compared on every run, so a failed build is retried and a manual `git pull` is caught too.
if [[ "$(./install.sh --stamp)" != "$(cat host/build/.stamp 2>/dev/null)" ]]; then
  log "helper sources changed, rebuilding"
  ./install.sh
fi
