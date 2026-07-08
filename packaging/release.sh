#!/usr/bin/env bash
# One-command Hovpn release — updates BOTH distribution channels:
#   • Self-hosted (hovpn.vip): rebuilds the signed CRX + updates.xml and
#     deploys them to the server directly (live immediately).
#   • Chrome Web Store: commits + pushes, which triggers the publish-webstore
#     GitHub Action (uploads + submits for review).
#
#   ./packaging/release.sh 1.0.2
#
# Runs locally on purpose: the extension signing key and the server SSH key
# stay on your machine instead of in CI secrets. Requirements (all local):
#   - keys/hovpn-private-key.pem   (CRX signing key)
#   - Google Chrome                (for packing the CRX)
#   - SSH access to 'germany-server'
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

VERSION="${1:?Usage: ./packaging/release.sh <version>   e.g. 1.0.2}"
if ! printf '%s' "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "ERROR: version must look like 1.0.2" >&2; exit 1
fi

KEY="keys/hovpn-private-key.pem"
SERVER="germany-server"
WEBROOT="/var/www/hovpn.vip/public_html"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CRX_APPID="mbjbjjnaihiegbpjdjoflfmehppobbod"

[ -f "$KEY" ] || { echo "ERROR: signing key $KEY not found" >&2; exit 1; }
[ -x "$CHROME" ] || { echo "ERROR: Google Chrome not found at $CHROME" >&2; exit 1; }

echo "== 1/6  set version $VERSION in extension/manifest.json =="
HOVPN_VER="$VERSION" node -e "const fs=require('fs'),p='extension/manifest.json',m=JSON.parse(fs.readFileSync(p));m.version=process.env.HOVPN_VER;fs.writeFileSync(p,JSON.stringify(m,null,2)+'\n')"

echo "== 2/6  rebuild Web Store zip (key stripped) =="
rm -rf packaging/store/build packaging/store/hovpn-store.zip
cp -R extension packaging/store/build
node -e "const fs=require('fs'),p='packaging/store/build/manifest.json',m=JSON.parse(fs.readFileSync(p));delete m.key;fs.writeFileSync(p,JSON.stringify(m,null,2)+'\n')"
find packaging/store/build -name '.DS_Store' -delete
( cd packaging/store/build && zip -rq ../hovpn-store.zip . -x '*.DS_Store' )

echo "== 3/6  rebuild + sign CRX =="
rm -rf /tmp/hovpn-crx-rel && mkdir -p /tmp/hovpn-crx-rel
cp -R extension /tmp/hovpn-crx-rel/hovpn
find /tmp/hovpn-crx-rel/hovpn -name '.DS_Store' -delete
"$CHROME" --pack-extension=/tmp/hovpn-crx-rel/hovpn --pack-extension-key="$PWD/$KEY" --no-message-box >/dev/null 2>&1 || true
[ -f /tmp/hovpn-crx-rel/hovpn.crx ] || { echo "ERROR: CRX packing failed" >&2; exit 1; }
cp /tmp/hovpn-crx-rel/hovpn.crx packaging/crx/hovpn.crx

echo "== 4/6  write updates.xml ($VERSION) =="
cat > packaging/crx/updates.xml <<XML
<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='$CRX_APPID'>
    <updatecheck codebase='https://hovpn.vip/download/hovpn.crx' version='$VERSION' />
  </app>
</gupdate>
XML

echo "== 5/6  deploy self-hosted CRX + updates.xml to hovpn.vip =="
scp -q packaging/crx/hovpn.crx "$SERVER:$WEBROOT/download/hovpn.crx"
scp -q packaging/crx/updates.xml "$SERVER:$WEBROOT/updates.xml"
ssh "$SERVER" "chmod a+r '$WEBROOT/download/hovpn.crx' '$WEBROOT/updates.xml'"
LIVE=$(curl -sS --max-time 20 https://hovpn.vip/updates.xml | grep -o "version='[0-9.]*'" | tail -1)
echo "   self-hosted updates.xml now serves: $LIVE"

echo "== 6/6  commit + push (triggers Web Store publish CI) =="
git add -A
git commit -q -m "Release $VERSION (Web Store + self-hosted)" \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push -q origin main

echo ""
echo "Release $VERSION complete:"
echo "  - self-hosted (hovpn.vip): LIVE now — clients auto-update"
echo "  - Chrome Web Store: submitted for review by CI (live after review passes)"
