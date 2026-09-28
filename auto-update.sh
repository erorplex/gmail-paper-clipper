#!/bin/bash
# Turns automatic updates on or off (macOS). When on, a launchd agent runs ./update.sh at login and
# every five minutes, so every push to main reaches this Mac within a few minutes.
# One agent per user: turning it on in another checkout moves it there.
# Usage: ./auto-update.sh on | off | status
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"
LABEL="io.github.erorplex.paper-clipper.update"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/PaperClipper/update.log"
DOMAIN="gui/$(id -u)"

xml() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' <<<"$1"; }
target() { /usr/libexec/PlistBuddy -c 'Print :ProgramArguments:0' "$PLIST" 2>/dev/null || true; }
stop() {
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
}

case "${1:-status}" in
  on)
    mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
    cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(xml "$ROOT/update.sh")</string>
  </array>
  <key>StartInterval</key>
  <integer>300</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$(xml "$LOG")</string>
  <key>StandardErrorPath</key>
  <string>$(xml "$LOG")</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin</string>
  </dict>
</dict>
</plist>
PLIST
    if ! plutil -lint "$PLIST" >/dev/null || [[ "$(target)" != "$ROOT/update.sh" ]]; then
      rm -f "$PLIST"
      echo "✗ could not write the launchd agent for $ROOT" >&2
      exit 1
    fi
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    launchctl bootstrap "$DOMAIN" "$PLIST"
    echo "✓ automatic updates on: checks main every 5 minutes"
    echo "  log: $LOG"
    ;;
  off)
    stop
    echo "✓ automatic updates off"
    ;;
  off-if-here)
    # Used by uninstall.sh: leave an agent that belongs to another checkout alone.
    if [[ "$(target)" == "$ROOT/update.sh" ]]; then
      stop
      echo "✓ automatic updates off"
    fi
    ;;
  status)
    if ! launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
      echo "automatic updates: off"
    elif [[ "$(target)" == "$ROOT/update.sh" ]]; then
      echo "automatic updates: on for this folder"
    elif [[ -x "$(target)" ]]; then
      echo "automatic updates: on for another folder: $(target)"
    else
      echo "automatic updates: broken, the folder moved. Run ./auto-update.sh on here." >&2
    fi
    if [[ -f "$LOG" ]]; then
      echo "last log entries:"
      tail -n 5 "$LOG"
    fi
    ;;
  *)
    echo "Usage: $0 on | off | status" >&2
    exit 1
    ;;
esac
