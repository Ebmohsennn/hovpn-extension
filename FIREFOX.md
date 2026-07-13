# Hovpn on Firefox

Hovpn runs on Firefox too. The engine (xray-core) and the popup UI are shared;
only three things differ from Chrome, all handled in code:

1. **Manifest** — Firefox needs an add-on id and an event-page background.
   Built by `packaging/firefox/build.sh` → `packaging/firefox/hovpn-firefox.zip`
   (adds `browser_specific_settings.gecko.id = hovpn@hovpn.vip`, sets
   `background.scripts`, strips the Chrome `key`).
2. **Proxy API** — `background.js` detects Firefox (moz-extension URL) and uses
   Firefox's `proxy.settings` schema (`proxyType: manual`, `socks`,
   `socksVersion: 5`, `proxyDNS: true`).
3. **Native host** — the installers also write a Firefox-format manifest
   (`allowed_extensions: ["hovpn@hovpn.vip"]`) to Firefox's location:
   - macOS: `~/Library/Application Support/Mozilla/NativeMessagingHosts/`
   - Linux: `~/.mozilla/native-messaging-hosts/`
   - Windows: registry `HKCU\Software\Mozilla\NativeMessagingHosts\com.hovpn.host`

## Distribution (you do this — Firefox requires Mozilla signing)

Unlike Chrome, **Firefox will not run an unsigned extension**. You must submit
the package to Mozilla:

1. Build it: `./packaging/firefox/build.sh`
2. Go to https://addons.mozilla.org/developers/ → **Submit a New Add-on**.
3. Upload `packaging/firefox/hovpn-firefox.zip`.
4. Choose **On this site (AMO)** to list it publicly, or **On your own** to get
   a signed `.xpi` you host yourself (e.g. on hovpn.vip) with an update URL.
5. Mozilla signs it (usually automated for these permissions). Users install
   the signed add-on, then run the Hovpn helper installer — same as Chrome.

Keep the add-on id stable at `hovpn@hovpn.vip` (the native host trusts exactly
that id).

## Not yet verified

The Firefox code paths (proxy schema, native messaging) were written but not
run in an actual Firefox here. Test once after the first signed build: install
the add-on + helper, connect, and confirm traffic routes (check your IP with
the proxy on vs off) and that `about:debugging` shows no errors.
