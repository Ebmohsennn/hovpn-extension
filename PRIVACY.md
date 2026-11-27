# Hovpn Privacy Policy

_Last updated: 2026-11-27_

Hovpn is a proxy client for the Chrome/Chromium/Edge/Brave browser, operated
by Mohsen (ebmohsen.com) under the Hovpn brand (https://hovpn.vip).

## What Hovpn does

Hovpn routes your browser's traffic through a proxy server that **you**
configure (by pasting a share link or a subscription URL). The actual proxy
connection is made by a local helper (`xray-core`) running on your own
computer.

## Data we collect

**None.** Hovpn has no analytics, no telemetry, and no accounts. The
developer operates no servers that receive your data through the extension.

## Data stored on your device (only)

- The server profiles and subscription URLs you add are stored locally in the
  browser's extension storage on your own machine. They are never transmitted
  to the developer.
- Connection settings (SOCKS port, bypass list, theme) are kept in the
  browser's synced extension storage: if you have turned on browser sync,
  your browser vendor copies these three settings to your other devices.
  Server profiles and subscription URLs are not synced.
- The local helper writes a runtime config and a diagnostic log under
  `~/.hovpn` (`%LOCALAPPDATA%\Hovpn` on Windows), readable only by your user
  account. The config (which holds your server's credentials) is removed when
  you disconnect. The log holds the proxy engine's start-up messages and
  errors and is cleared on every connect. Access logging is switched off, so
  it keeps no record of the sites you visit; an error line can still name a
  host that failed to connect.

## Network connections Hovpn makes

- To **your** proxy server(s), as configured by you — this is the core function.
- To **your** subscription URL, when you add or refresh a subscription, to
  download your server list. This request is made by the local helper.
- To each server in your list, a bare TCP connection when you open the popup,
  to measure latency. These go directly from your computer, not through the
  tunnel, so your network can see which server addresses you have saved.
- To GitHub (`github.com`), only when you install the helper from source, to
  download a pinned, checksum-verified `xray-core` release. The packaged
  installers bundle `xray-core` and Node and download nothing.

Hovpn does not send your browsing data anywhere except through the proxy
server you chose.

## Permissions

- `proxy` — to point the browser at your local proxy port.
- `storage` — to save your server list and settings locally.
- `nativeMessaging` — to talk to the local helper that runs xray-core.
- `alarms` — to periodically check the connection is still alive.
- `notifications` — to alert you if the connection drops.

## Contact

Questions: https://hovpn.vip
