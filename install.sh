#!/bin/bash
# Installs the MailClip Mac helper: compiles it and registers it with Chrome (and other Chromium
# browsers that are present) as native messaging host.
# Usage: ./install.sh [extension-id]   (the id defaults to the one pinned by "key" in manifest.json)
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"
HOST_NAME="mailclip.helper"
BIN="$ROOT/host/build/mailclip-helper"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "Der Mac-Helfer läuft nur auf macOS." >&2
  exit 1
fi
if ! xcrun --find swiftc >/dev/null 2>&1; then
  echo "swiftc fehlt. Bitte zuerst 'xcode-select --install' ausführen und dann erneut starten." >&2
  exit 1
fi

echo "→ Helfer kompilieren …"
mkdir -p "$ROOT/host/build"
xcrun swiftc -O "$ROOT/host/MailClipHelper.swift" -o "$BIN"

if [[ $# -ge 1 ]]; then
  EXT_ID="$1"
else
  KEY="$(plutil -extract key raw -o - "$ROOT/manifest.json")"
  EXT_ID="$(printf '%s' "$KEY" | base64 -d | shasum -a 256 | head -c 32 | tr '0-9a-f' 'a-p')"
fi

MANIFEST="$(cat <<EOF
{
  "name": "$HOST_NAME",
  "description": "MailClip: puts mail text and attachments on the macOS clipboard",
  "path": "$BIN",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
EOF
)"

BROWSERS=(
  "Google/Chrome"
  "Google/Chrome Beta"
  "Google/Chrome Canary"
  "Chromium"
  "BraveSoftware/Brave-Browser"
  "Microsoft Edge"
  "Arc/User Data"
)
installed=0
for browser in "${BROWSERS[@]}"; do
  dir="$HOME/Library/Application Support/$browser"
  [[ -d "$dir" ]] || continue
  mkdir -p "$dir/NativeMessagingHosts"
  printf '%s\n' "$MANIFEST" > "$dir/NativeMessagingHosts/$HOST_NAME.json"
  echo "✓ registriert für $browser"
  installed=$((installed + 1))
done
if [[ $installed -eq 0 ]]; then
  echo "Kein Chrome-Profil gefunden. Bitte Chrome einmal starten und das Skript erneut ausführen." >&2
  exit 1
fi

# Self-test: send {"type":"ping"} with its 4-byte length prefix.
if printf '\x0f\x00\x00\x00{"type":"ping"}' | "$BIN" | tail -c +5 | grep -q '"ok":true'; then
  echo "✓ Helfer antwortet"
else
  echo "✗ Helfer antwortet nicht" >&2
  exit 1
fi

echo
echo "Fertig. Erweiterungs-ID: $EXT_ID"
echo "Falls noch nicht geschehen: chrome://extensions → Entwicklermodus → „Entpackte Erweiterung laden“ → diesen Ordner wählen."
