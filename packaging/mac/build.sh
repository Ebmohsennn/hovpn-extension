#!/bin/bash
# Builds, signs, and (if a notarytool keychain profile is given) notarizes
# the Hovpn macOS installer. Not committed as a build artifact — run locally.
#
#   ./build.sh [notary-profile-name]
#
# Without a profile name, it still produces a signed .pkg (works, but macOS
# will show a Gatekeeper warning on first launch since it's not notarized).
set -euo pipefail
cd "$(dirname "$0")"

VERSION="1.0.0"
IDENTITY="Developer ID Installer: Mohsen Ebrahimizadeh Ghahrood (KW29668Z74)"
OUT_DIR="./out"
mkdir -p "$OUT_DIR"

echo "== staging host script from the single source of truth =="
cp ../../native-host/xray-manager.js ./scripts/hovpn-host.js

if [ ! -f ./scripts/node-arm64 ] || [ ! -f ./scripts/xray-arm64 ]; then
  echo "== bundled binaries missing — running fetch-binaries.sh =="
  ./fetch-binaries.sh
fi

echo "== pkgbuild: component package (scripts-only, current-user-home) =="
pkgbuild \
  --nopayload \
  --scripts ./scripts \
  --identifier com.hovpn.host.pkg \
  --version "$VERSION" \
  "$OUT_DIR/hovpn-component.pkg"

echo "== productbuild: distribution package =="
productbuild \
  --distribution ./distribution.xml \
  --resources ./resources \
  --package-path "$OUT_DIR" \
  "$OUT_DIR/Hovpn-unsigned.pkg"

echo "== checking for a 'Developer ID Installer' signing identity =="
if security find-identity -v -p basic 2>/dev/null | grep -q "Developer ID Installer"; then
  echo "== signing with: $IDENTITY =="
  productsign --sign "$IDENTITY" "$OUT_DIR/Hovpn-unsigned.pkg" "$OUT_DIR/Hovpn.pkg"
  rm "$OUT_DIR/Hovpn-unsigned.pkg"
else
  echo "!! No 'Developer ID Installer' identity found (you have 'Developer ID Application',"
  echo "   which signs apps/binaries, not installer packages — a separate cert type)."
  echo "   Shipping unsigned for now: $OUT_DIR/Hovpn-unsigned.pkg"
  mv "$OUT_DIR/Hovpn-unsigned.pkg" "$OUT_DIR/Hovpn.pkg"
fi

if [ -n "${1:-}" ]; then
  echo "== notarizing via profile '$1' =="
  xcrun notarytool submit "$OUT_DIR/Hovpn.pkg" --keychain-profile "$1" --wait
  echo "== stapling notarization ticket =="
  xcrun stapler staple "$OUT_DIR/Hovpn.pkg"
  echo "== verifying =="
  spctl --assess --type install -v "$OUT_DIR/Hovpn.pkg"
else
  echo "(skipping notarization — no profile name given)"
fi

echo ""
echo "Built: $OUT_DIR/Hovpn.pkg"
ls -la "$OUT_DIR/Hovpn.pkg"
