# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue: open the
repository's **Security** tab and choose **Report a vulnerability**
(<https://github.com/Ebmohsennn/hovpn-extension/security/advisories/new>).

Include what you found, the steps that reproduce it, and the impact you expect.
You will get an acknowledgement within a few days, and credit in the release
notes when the fix ships, if you want it.

## Supported versions

Only the latest release (the version on the Chrome Web Store and at the head of
`main`) receives security fixes.

## What is in scope

- The extension (`extension/`) and the native-messaging helper (`native-host/`).
- The installers and release scripts under `packaging/`, and the GitHub Actions
  workflows.

The proxy engine itself is [xray-core](https://github.com/XTLS/Xray-core);
report problems in it to that project. Your own proxy server is outside this
project's scope.

## What Hovpn does and does not protect

Hovpn routes the browser's traffic through the server you configure. It is not
a system-wide VPN and has no kill switch: other applications are not tunnelled,
and if the tunnel drops while the proxy setting is cleared, the browser connects
directly. See "Known limitations" in the README.
