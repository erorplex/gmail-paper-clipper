#!/bin/bash
# Removes the MailClip helper registration and its cached copies.
set -euo pipefail

HOST_NAME="mailclip.helper"
for manifest in "$HOME/Library/Application Support"/{Google/Chrome,"Google/Chrome Beta","Google/Chrome Canary",Chromium,BraveSoftware/Brave-Browser,"Microsoft Edge","Arc/User Data"}/NativeMessagingHosts/$HOST_NAME.json; do
  if [[ -f "$manifest" ]]; then
    rm "$manifest"
    echo "✓ entfernt: $manifest"
  fi
done
rm -rf "$HOME/Library/Caches/MailClip"
echo "Fertig. Die Erweiterung selbst entfernst du unter chrome://extensions."
