#!/bin/bash
# Removes the Paper Clipper helper registration and its cached copies.
# The extension itself, with everything it stores in Chrome, is removed at chrome://extensions.
set -euo pipefail

"$(dirname "$0")/auto-update.sh" off-if-here

HOST_NAME="io.github.erorplex.paper_clipper"
BROWSERS=(
  "Google/Chrome"
  "Google/Chrome Beta"
  "Google/Chrome Canary"
  "Chromium"
  "BraveSoftware/Brave-Browser"
  "Microsoft Edge"
  "Arc/User Data"
)
for browser in "${BROWSERS[@]}"; do
  manifest="$HOME/Library/Application Support/$browser/NativeMessagingHosts/$HOST_NAME.json"
  if [[ -f "$manifest" ]]; then
    rm "$manifest"
    echo "✓ removed from $browser"
  fi
done
rm -rf "$HOME/Library/Caches/PaperClipper"
rm -rf "$(dirname "$0")/host/build"
echo "Done. Remove the extension itself at chrome://extensions."
