# Hovpn — secure proxy for Chrome

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/ifcbhfjmblebbinhgjhfmjgnkmoneifg?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/hovpn/ifcbhfjmblebbinhgjhfmjgnkmoneifg)
[![License: GPL v3](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)](LICENSE)

**Install:** [Chrome Web Store](https://chromewebstore.google.com/detail/hovpn/ifcbhfjmblebbinhgjhfmjgnkmoneifg) · Website: [hovpn.vip](https://hovpn.vip) · by Mohsen Ebrahimizadeh ([ebmohsen.com](https://ebmohsen.com))

Hovpn lets you paste a V2Ray/Xray share link (`vmess://`, `vless://`,
`trojan://`, `ss://`) or a **subscription URL** and route **only the
browser's** traffic through it — the rest of your system is untouched.

## Why two pieces

Chrome extensions can't speak the VMess/VLESS/Trojan protocol directly (no
raw socket access in the extension sandbox). So the actual proxying is done
by a real `xray-core` process running locally; the extension just:

1. Tells the browser (via `chrome.proxy`) to send its traffic to
   `socks5://127.0.0.1:<port>`, and
2. Uses a small **native messaging host** (`native-host/xray-manager.js`) to
   start/stop that local `xray-core` process with your config.

```
Browser --chrome.proxy--> 127.0.0.1:1080 (xray-core, SOCKS5) --VLESS/VMess/Trojan--> your server
  ^
  popup (connect UI, server list, subscriptions)
  background.js <--native messaging--> xray-manager.js (spawns/kills xray-core)
```

## Prerequisites

- **Node.js** — the installer and native host run on Node (no npm packages;
  built-ins only). Install from https://nodejs.org (Windows) / `brew install
  node` (macOS) / your package manager (Linux).
- **xray-core** — you do **not** need to install this yourself; the installer
  auto-downloads the correct binary for your OS/arch from the official
  [XTLS/Xray-core releases](https://github.com/XTLS/Xray-core/releases) into
  `~/.hovpn/bin` (`%LOCALAPPDATA%\Hovpn\bin` on Windows).

## 1. Load the extension

1. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`),
   enable **Developer mode**.
2. Click **Load unpacked**, select the `extension/` folder.
3. Copy the **ID** shown under the extension (a 32-letter string).

## 2. Install the native host (cross-platform)

The installer registers the native host for Chrome, Chromium, Edge and Brave,
and downloads xray-core for you.

**macOS / Linux:**
```bash
cd native-host
./install.sh <extension-id-you-copied>
```

**Windows** (Command Prompt or PowerShell):
```bat
cd native-host
install.bat <extension-id-you-copied>
```

Both are thin wrappers around the real cross-platform installer,
`node install.js <extension-id>`, which:
- downloads xray-core if it isn't already in the Hovpn bin dir;
- writes a launcher that starts the host with an **absolute** Node path
  (Chrome launches native hosts with a minimal PATH that excludes
  Homebrew/nvm, so a bare `node` would fail);
- registers the `com.hovpn.host` manifest — a JSON file under each browser's
  `NativeMessagingHosts` directory on macOS/Linux, or a JSON file plus an
  `HKCU\…\NativeMessagingHosts\com.hovpn.host` registry key on Windows.

**Fully quit and reopen the browser** after this step (a plain reload of the
extension is not always enough for the browser to pick up a new native host).

## 3. Use it

1. Click the extension icon, then **+ Server** — give it a name (optional)
   and paste a single share link, then **Save**. Repeat for as many servers as
   you want. Or click **+ Subscription** and paste a subscription URL instead
   (see below) to import many servers at once.
2. Click the big power button for **quick connect** (picks your last-used
   server, else your fastest favorite, else the fastest known server), or hit
   **Connect** next to a specific row to target that one directly. The hero
   status shows a live "Connected · mm:ss" timer once `xray-core` is up and
   Chrome's proxy is set.
3. Click the power button again (or **Disconnect** on the active row) to tear
   both down. Non-Chrome apps and the rest of the OS are never touched, since
   only `chrome.proxy` (Chrome-scoped) is used — no system-wide proxy or VPN
   interface involved.
4. Only one profile can be active at a time; connecting a different one
   automatically stops the previous `xray-core` process first.
5. Use the star icon to favorite a server, the search box to filter by name,
   and the sort dropdown (Favorites first / Fastest first / Name) to reorder
   the list. Latency is a TCP-handshake-time probe to each server's address —
   run automatically when the popup opens and on demand via the refresh icon.
   It measures reachability of the front server, not full round-trip time
   through the proxied protocol.
6. **Rename / edit**: the pencil on any server row opens an editor to rename
   it or change its link; a subscription's **Edit** button (in its card
   header) renames it or points it at a new URL. Renaming a subscription
   without changing its URL is instant (no re-fetch); changing the URL
   re-imports from the new address.

Profiles are stored in `chrome.storage.local` (not synced across machines —
a subscription can import hundreds of servers, which would blow past
`storage.sync`'s 8KB-per-item quota almost immediately).

## Subscription URLs

Many providers give you a "subscription" URL instead of (or in addition to)
individual links — it's what native V2Ray clients (v2rayN, v2rayNG, etc.)
poll to get your server list. Paste it into **+ Subscription** along with
an optional label, and the extension:

1. Sends the URL to the native host (`xray-manager.js`), which fetches it
   with Node's `fetch` — deliberately done outside the browser so there's no
   CORS fight and no need for the extension to request broad host permissions.
2. Decodes the response — supports the standard format: base64 of
   newline-separated `vmess://`/`vless://`/`trojan://`/`ss://` links (what
   virtually every V2Ray/Xray panel produces). JSON-based subscription
   formats (SIP008, sing-box, Clash YAML) aren't supported yet and return a
   clear error rather than silently mis-parsing.
3. Parses each link with the same `parseConfig.js` used for manual profiles,
   and saves them as a group in the popup (shown with a header: label, count,
   **Refresh**, **Remove**).

Re-fetching a subscription (via **Refresh**) replaces that group's profiles
in place — it diffs by subscription URL, so it won't duplicate entries on
every refresh. Manually-added profiles are a separate group and are never
touched by a subscription refresh.

Options (gear icon, top right of the popup) let you set the appearance
(match system / light / dark), the local SOCKS port (default `1080`), and
the bypass list (hosts always excluded from the proxy, default
`localhost,127.0.0.1`).

## Crash recovery & background auto-reconnect

Every time the popup opens, `background.js` asks the native host whether
`xray-core` is actually still running and reconciles that with what Chrome's
proxy is pointed at. If `xray-core` died on its own (crash, sleep/wake, OS
reboot) while the extension still thinks it's connected, it's silently
restarted using the last-connected profile's config — the hero status will
show "(auto-restarted)". If the restart itself fails, the proxy is cleared
and the popup shows why, instead of leaving Chrome pointed at a dead SOCKS
port.

This same check also runs **every minute in the background** via
`chrome.alarms`, independent of whether the popup is open — so a crash gets
noticed and repaired even if you never look at the extension. A desktop
notification (`chrome.notifications`) fires only on an actual state
*transition* (was running → died, or was down → auto-repaired), not on every
tick, so a persistently broken connection doesn't spam you.

## Troubleshooting

- **"xray-core not found / failed to start"**: re-run the installer
  (`install.sh` / `install.bat`) — it re-downloads xray-core. The binary
  lives at `~/.hovpn/bin/xray` (`%LOCALAPPDATA%\Hovpn\bin\xray.exe` on
  Windows).
- **"Specified native messaging host not found" / "Native host has exited"**:
  re-run the installer with the correct extension ID (it must exactly match
  `chrome://extensions`; IDs change if you remove and re-add an unpacked
  extension), then **fully quit and reopen the browser**. "Host has exited"
  almost always means Node wasn't found — the installer bakes an absolute
  Node path into the launcher to avoid this.
- **Logs**: xray-core's output is appended to `~/.hovpn/xray.log`
  (`%LOCALAPPDATA%\Hovpn\xray.log`); the generated config it runs is
  `~/.hovpn/xray-config.json`.
- **Stuck proxy after a crash**: this never touches OS-level proxy settings,
  so nothing shows in system settings; clear the browser's extension-set
  proxy by clicking Disconnect or removing the extension.

## Known limitations

- `parseConfig.js` covers the common VMess/VLESS/Trojan/Shadowsocks fields
  (TCP/WS/gRPC/H2 transports, TLS and basic Reality). Exotic combinations
  may need hand edits to the generated `xray-config.json`.
- No per-domain routing rules beyond the static bypass list — everything
  not in the bypass list goes through the proxy while connected.
- Only one profile can be active at a time (by design — matches "use one
  config in Chrome," not a multi-hop router).
- "Latency" is TCP handshake time to each server's address, not real
  round-trip time through the negotiated protocol/tunnel — a reachability
  and rough-speed proxy, same technique most V2Ray GUI clients use for their
  quick "ping" sort.
- `chrome.alarms` enforces a 1-minute minimum period, so background crash
  detection has up to ~60s of lag; opening the popup always re-checks
  immediately regardless.
- This stays a Chrome-only proxy by design, not a system VPN — no kill
  switch, no mobile app, no traffic-shaping/ad-block claims. Those aren't on
  the roadmap here; they're a different architecture entirely.
- WebRTC is not restricted yet: a page that uses WebRTC (calls, some
  "what is my IP" checks) can send UDP outside the proxy and see your real
  address. The code that restricts it is in `extension/background.js` and
  switches on once the `privacy` permission is added to the manifest; until
  then, disable WebRTC or use a WebRTC-limiting extension if this matters to you.
- The helper pins one xray-core release and verifies its checksum, so it does
  not follow upstream automatically; a new Hovpn release raises the pin.

## What's been tested

- `native-host/xray-manager.js` was exercised end-to-end against a real
  `xray-core` 26.x binary: start (spawns detached, SOCKS5 inbound verified
  reachable), status, simulated crash (`kill -9`) detection, restart, and
  clean stop all pass.
- Subscription fetch/decode was tested against a mock local server and
  against a real production subscription URL (10 servers: vless over
  reality/tcp, tls/ws, and tls/xhttp). All 10 parsed correctly and their
  generated configs were accepted and started cleanly by real `xray-core` —
  this is what caught and fixed two real gaps: `xhttp`-transport settings
  weren't being built at all, and the TLS `fingerprint` (`fp=`) param wasn't
  threaded through to `tlsSettings`.
- The new `ping` (latency) native host command was tested against known-good
  hosts (real ~30ms round trips), an unreachable IP, and a nonexistent
  hostname — correctly returns timing for reachable hosts and `null` on
  timeout/DNS failure, all 4 probes running in parallel (~3s wall time total,
  not 12s serial). Also re-tested against all 10 real subscription servers
  (~194ms total for all 10 in parallel).
- **Cross-platform installer** was verified end-to-end **on macOS
  (arm64)**: `install.js` auto-downloaded the correct xray build, registered
  `com.hovpn.host` for Chrome/Chromium/Edge/Brave, and the launcher → host →
  bundled xray → SOCKS proxy chain worked under Chrome's minimal launch PATH.
  The **Windows** path (registry registration via `reg`, `.bat` launcher,
  `taskkill` process management, `xray.exe`, PowerShell unzip) and the
  **Linux** path are written to Chrome's documented requirements but have
  **not** been run on real Windows/Linux machines from here — they need a
  pass on those OSes before you rely on them.
- All extension JS files pass `node --check`; `manifest.json` is valid JSON.
  All popup DOM element IDs referenced from `popup.js` were cross-checked
  against `popup.html`.
- The popup/background/options UI (the new hero power button, search/sort,
  favorites, theming, live timer, desktop notifications) has **not** been
  driven in an actual Chrome window from here — no browser automation tool
  was available in this session. Please do a manual pass after loading it:
  quick-connect via the power button, favorite/search/sort a few servers,
  confirm outbound traffic actually goes through your server (check your IP
  via a "what's my IP" site with the proxy on vs off), toggle the theme
  option, and try killing `xray-core` manually (`pkill -f xray-config.json`,
  or `taskkill` on Windows) to see both the popup's "(auto-restarted)" state
  and — if you wait up to a minute with the popup closed — the background
  desktop notification.

## License

Copyright (C) 2026 Mohsen Ebrahimizadeh.

Hovpn is free software: you can redistribute it and/or modify it under the
terms of the [GNU General Public License v3.0 or later](LICENSE).

The Hovpn name, logo and icons are not covered by the GPL. If you publish a
fork, give it its own name and icons. See [TRADEMARKS.md](TRADEMARKS.md).

Xray-core, which the installer downloads, is a separate project under the
Mozilla Public License 2.0.
