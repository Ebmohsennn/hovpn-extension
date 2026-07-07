# Hovpn Privacy Policy

_Last updated: 2026-07-08_

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
- Connection settings (SOCKS port, bypass list, theme) are stored locally.
- The local helper writes a runtime config and log file under `~/.hovpn`
  (`%LOCALAPPDATA%\Hovpn` on Windows) on your own machine.

## Network connections Hovpn makes

- To **your** proxy server(s), as configured by you — this is the core function.
- To **your** subscription URL, when you add or refresh a subscription, to
  download your server list. This request is made by the local helper.
- To GitHub (`github.com` / `nodejs.org`), only during installation, to
  download the `xray-core` and Node runtimes.

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
