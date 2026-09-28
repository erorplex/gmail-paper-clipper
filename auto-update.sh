#!/bin/bash
# Turns automatic updates on or off (macOS). When on, a launchd agent runs ./update.sh at login and
# every five minutes, so every push to main reaches this Mac within a few minutes.
# Usage: ./auto-update.sh on | off | status
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"
LABEL="io.github.erorplex.paper-clipper.update"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/PaperClipper/update.log"
DOMAIN="gui/$(id -u)"

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
    <string>$ROOT/update.sh</string>
  </array>
  <key>StartInterval</key>
  <integer>300</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG</string>
  <key>StandardErrorPath</key>
  <string>$LOG</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin</string>
  </dict>
</dict>
</plist>
PLIST
    plutil -lint "$PLIST" >/dev/null
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    launchctl bootstrap "$DOMAIN" "$PLIST"
    echo "✓ automatic updates on: checks main every 5 minutes"
    echo "  log: $LOG"
    ;;
  off)
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "✓ automatic updates off"
    ;;
  status)
    if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
      echo "automatic updates: on"
    else
      echo "automatic updates: off"
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
