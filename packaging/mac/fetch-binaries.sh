#!/bin/bash
# Downloads the bundled Node + xray-core binaries for both macOS architectures
# into ./scripts, so build.sh can assemble the installer. These binaries are
# large and are NOT committed to git — run this once before building.
set -euo pipefail
cd "$(dirname "$0")"

NODE_VER="v24.18.0"          # Node LTS bundled into the installer
XRAY_VER="v26.3.27"          # xray-core version bundled
SCRIPTS="./scripts"
TMP="./build"
mkdir -p "$SCRIPTS" "$TMP"

fetch_node() {
  local arch="$1" tag="$2"
  echo "== Node $NODE_VER ($arch) =="
  curl -sL -o "$TMP/node-$arch.tar.gz" \
    "https://nodejs.org/dist/$NODE_VER/node-$NODE_VER-darwin-$tag.tar.gz"
  tar -xzf "$TMP/node-$arch.tar.gz" -C "$TMP" "node-$NODE_VER-darwin-$tag/bin/node"
  cp "$TMP/node-$NODE_VER-darwin-$tag/bin/node" "$SCRIPTS/node-$arch"
  chmod +x "$SCRIPTS/node-$arch"
}

fetch_xray() {
  local arch="$1" asset="$2"
  echo "== xray-core $XRAY_VER ($arch) =="
  curl -sL -o "$TMP/xray-$arch.zip" \
    "https://github.com/XTLS/Xray-core/releases/download/$XRAY_VER/$asset"
  unzip -o "$TMP/xray-$arch.zip" xray -d "$TMP/xr-$arch" >/dev/null
  cp "$TMP/xr-$arch/xray" "$SCRIPTS/xray-$arch"
  chmod +x "$SCRIPTS/xray-$arch"
}

fetch_node arm64 arm64
fetch_node x64 x64
fetch_xray arm64 Xray-macos-arm64-v8a.zip
fetch_xray x64 Xray-macos-64.zip

rm -rf "$TMP"
echo ""
echo "Fetched into $SCRIPTS:"
ls -la "$SCRIPTS"/node-* "$SCRIPTS"/xray-*
