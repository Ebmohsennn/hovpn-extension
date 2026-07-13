#!/usr/bin/env bash
# Builds the Firefox package (XPI-ready zip) from the shared extension/ source.
# Firefox differs from Chrome only in the manifest: it needs a gecko add-on id,
# uses an event-page background (not a service worker), and ignores the Chrome
# `key`. The JS (incl. background.js's Firefox proxy branch) is shared as-is.
#
#   ./packaging/firefox/build.sh   ->  packaging/firefox/hovpn-firefox.zip
set -euo pipefail
cd "$(dirname "$0")/../.."   # repo root

OUT_DIR="packaging/firefox"
BUILD="$OUT_DIR/build"
FIREFOX_ID="hovpn@hovpn.vip"

rm -rf "$BUILD" "$OUT_DIR/hovpn-firefox.zip"
cp -R extension "$BUILD"
find "$BUILD" -name '.DS_Store' -delete

# Rewrite the manifest for Firefox.
FIREFOX_ID="$FIREFOX_ID" node -e '
const fs = require("fs");
const p = "packaging/firefox/build/manifest.json";
const m = JSON.parse(fs.readFileSync(p, "utf8"));
delete m.key;                                   // Chrome-only
m.background = { scripts: ["background.js"] };   // Firefox = event page
m.browser_specific_settings = {
  gecko: { id: process.env.FIREFOX_ID, strict_min_version: "121.0" }
};
m.description = "Hovpn — secure, elegant proxy for Firefox. Import your config or subscription and route only the browser’s traffic.";
fs.writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
console.log("Firefox manifest: id=" + m.browser_specific_settings.gecko.id + " background=scripts");
'

( cd "$BUILD" && zip -rq ../hovpn-firefox.zip . -x '*.DS_Store' )
echo "Built $OUT_DIR/hovpn-firefox.zip"
echo "Next: submit it at https://addons.mozilla.org/developers/ (Firefox requires Mozilla signing)."
