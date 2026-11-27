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

# SHA-256 of each download, from https://nodejs.org/dist/$NODE_VER/SHASUMS256.txt and the
# .dgst file next to each xray release asset. Update these together with the versions above
# (and with native-host/download-xray.js and .github/workflows/windows-installer.yml).
NODE_SHA_arm64="e1a97e14c99c803e96c7339403282ea05a499c32f8d83defe9ef5ec66f979ed1"
NODE_SHA_x64="dfd0dbd3e721503434df7b7205e719f61b3a3a31b2bcf9729b8b91fea240f080"
XRAY_SHA_arm64="2e93a67e8aa1936ecefb307e120830fcbd4c643ab9b1c46a2d0838d5f8409eaf"
XRAY_SHA_x64="f5b0471d3459eff1b82e48af0aeac186abcc3298210070afbbbd8437a4e8b203"

# These binaries end up inside the signed installer, so refuse anything unexpected.
verify() {
  local file="$1" want="$2" got
  got=$(shasum -a 256 "$file" | awk '{print $1}')
  if [ "$got" != "$want" ]; then
    echo "ERROR: checksum mismatch for $file" >&2
    echo "  expected $want" >&2
    echo "  got      $got" >&2
    exit 1
  fi
}

fetch_node() {
  local arch="$1" tag="$2" sha="$3"
  echo "== Node $NODE_VER ($arch) =="
  curl -fsSL --proto '=https' -o "$TMP/node-$arch.tar.gz" \
    "https://nodejs.org/dist/$NODE_VER/node-$NODE_VER-darwin-$tag.tar.gz"
  verify "$TMP/node-$arch.tar.gz" "$sha"
  tar -xzf "$TMP/node-$arch.tar.gz" -C "$TMP" "node-$NODE_VER-darwin-$tag/bin/node"
  cp "$TMP/node-$NODE_VER-darwin-$tag/bin/node" "$SCRIPTS/node-$arch"
  chmod +x "$SCRIPTS/node-$arch"
}

fetch_xray() {
  local arch="$1" asset="$2" sha="$3"
  echo "== xray-core $XRAY_VER ($arch) =="
  curl -fsSL --proto '=https' -o "$TMP/xray-$arch.zip" \
    "https://github.com/XTLS/Xray-core/releases/download/$XRAY_VER/$asset"
  verify "$TMP/xray-$arch.zip" "$sha"
  unzip -o "$TMP/xray-$arch.zip" xray -d "$TMP/xr-$arch" >/dev/null
  cp "$TMP/xr-$arch/xray" "$SCRIPTS/xray-$arch"
  chmod +x "$SCRIPTS/xray-$arch"
}

fetch_node arm64 arm64 "$NODE_SHA_arm64"
fetch_node x64 x64 "$NODE_SHA_x64"
fetch_xray arm64 Xray-macos-arm64-v8a.zip "$XRAY_SHA_arm64"
fetch_xray x64 Xray-macos-64.zip "$XRAY_SHA_x64"

rm -rf "$TMP"
echo ""
echo "Fetched into $SCRIPTS:"
ls -la "$SCRIPTS"/node-* "$SCRIPTS"/xray-*
