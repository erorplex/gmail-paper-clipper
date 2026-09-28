#!/bin/bash
# Installs the Paper Clipper helper for macOS: compiles it and registers it as native messaging host
# with Chrome and every other Chromium browser found (Chrome Beta/Canary, Chromium, Brave, Edge, Arc).
# Usage: ./install.sh [extension-id]   (defaults to the id pinned by "key" in manifest.json)
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"
HOST_NAME="io.github.erorplex.paper_clipper"
BIN="$ROOT/host/build/paper-clipper-helper"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "The helper only runs on macOS. The text-only buttons work without it." >&2
  exit 1
fi
if ! xcrun --find swiftc >/dev/null 2>&1; then
  echo "Swift is missing. Run 'xcode-select --install' first, then run this script again." >&2
  exit 1
fi

echo "→ Compiling helper …"
mkdir -p "$ROOT/host/build"
xcrun swiftc -O "$ROOT/host/PaperClipperHelper.swift" -o "$BIN"

if [[ $# -ge 1 ]]; then
  EXT_ID="$1"
else
  KEY="$(plutil -extract key raw -o - "$ROOT/manifest.json")"
  EXT_ID="$(printf '%s' "$KEY" | base64 -d | shasum -a 256 | head -c 32 | tr '0-9a-f' 'a-p')"
fi

MANIFEST="$(cat <<EOF
{
  "name": "$HOST_NAME",
  "description": "Paper Clipper for Gmail: puts mail text and attachments on the macOS clipboard",
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
  echo "✓ registered for $browser"
  installed=$((installed + 1))
done
if [[ $installed -eq 0 ]]; then
  echo "No Chrome profile found. Start Chrome once, then run this script again." >&2
  exit 1
fi

# Self-test: {"type":"ping"} with its 4-byte length prefix.
if printf '\x0f\x00\x00\x00{"type":"ping"}' | "$BIN" | tail -c +5 | grep -q '"ok":true'; then
  echo "✓ helper responds"
else
  echo "✗ helper does not respond" >&2
  exit 1
fi

echo
echo "Done. Extension id: $EXT_ID"
echo "Next: chrome://extensions → Developer mode → Load unpacked → choose this folder."
echo "Optional: ./auto-update.sh on keeps this folder on the latest main automatically."
