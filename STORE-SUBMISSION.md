# Publishing Hovpn to the Chrome Web Store

## ⚠️ The most important thing to understand

The Web Store delivers **only the extension** (the UI). The extension is
sandboxed and **cannot run the proxy by itself**. Every user must **also**
install the **Hovpn helper** (`Hovpn.pkg` on macOS; the Windows installer)
once. So the real user flow is always **two steps**:

1. Install the Hovpn extension from the Web Store (one click).
2. Download and run the Hovpn helper installer from hovpn.vip (one time).

Plan your store listing and hovpn.vip download page around this. The listing
description **must** clearly say a helper download is required, or users will
leave 1-star reviews saying "it doesn't work."

## The file to upload

`packaging/store/hovpn-store.zip` — rebuild any time with:

```bash
# from the repo root
rm -rf packaging/store/build packaging/store/hovpn-store.zip
cp -R extension packaging/store/build
# strip the `key` field (the store assigns its own ID)
node -e "const fs=require('fs'),p='packaging/store/build/manifest.json',m=JSON.parse(fs.readFileSync(p));delete m.key;fs.writeFileSync(p,JSON.stringify(m,null,2))"
find packaging/store/build -name .DS_Store -delete
( cd packaging/store/build && zip -rq ../hovpn-store.zip . )
```

## Steps

1. Go to the **Chrome Web Store Developer Dashboard**:
   https://chrome.google.com/webstore/devconsole — sign in with the Google
   account that will own Hovpn, and pay the one-time **$5** registration fee
   if you haven't.
2. **Add new item** → upload `hovpn-store.zip`.
3. As soon as the draft is created, the dashboard shows the item's permanent
   **Extension ID** (also in the item URL). **Copy it.**
4. Fill in the listing: description (say the helper is required!), at least
   one 1280×800 screenshot, the 128px icon, a category, and the **privacy
   policy URL** (host `PRIVACY.md`'s contents at e.g. hovpn.vip/privacy —
   required because Hovpn uses `proxy` + `nativeMessaging`).
5. Submit for review.

## ⛓️ Critical follow-up: the helper must match the store's ID

The Web Store assigns a **different** extension ID than the local/dev one
(`mbjbjjnaihiegbpjdjoflfmehppobbod`). The helper's native-messaging
registration only accepts the ID it was built with, so **after step 3** you
must rebuild the helper with the store ID:

- `native-host/install.js` → set `DEFAULT_EXTENSION_ID` to the store ID.
- `packaging/mac/scripts/postinstall` → set `EXT_ID` to the store ID.
- Rebuild the `.pkg`: `cd packaging/mac && ./build.sh <notary-profile>`.

Then publish that helper on hovpn.vip. (Give me the store ID and I'll make
these edits and rebuild.)

## macOS helper build

```bash
cd packaging/mac
./fetch-binaries.sh          # downloads bundled node + xray (~600 MB, one-time)
./build.sh hovpn-notary      # builds, signs, notarizes (needs the notary profile)
# → packaging/mac/out/Hovpn.pkg
```

Without a notary profile it still builds a signed `.pkg`, but macOS shows a
Gatekeeper warning until it's notarized.

## Permission justification: `privacy` (added after 1.0.2)

Paste into the Web Store "Privacy practices" tab when submitting the next version:

> Used only to set `chrome.privacy.network.webRTCIPHandlingPolicy` to
> `disable_non_proxied_udp` while the proxy is connected, so WebRTC cannot
> reveal the user's real IP address outside the proxy. The setting is cleared
> when the user disconnects. No other privacy settings are read or changed.

Existing users will be asked to approve the new permission when they update.
