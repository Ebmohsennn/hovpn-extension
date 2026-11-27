# Releasing Hovpn

One command updates **both** distribution channels:

```bash
HOVPN_SERVER=<origin-ssh-alias> ./packaging/release.sh 1.0.2
```

What it does:
1. Sets the version in `extension/manifest.json`.
2. Rebuilds the Web Store zip (key stripped) and the signed self-hosted CRX.
3. Writes `updates.xml` for the new version.
4. **Deploys the CRX + `updates.xml` to hovpn.vip** → self-hosted installs
   auto-update within a few hours (Chrome polls the update URL).
5. **Commits + pushes** → triggers the `publish-webstore` GitHub Action, which
   uploads + submits the new version to the Chrome Web Store (goes live after
   Google's review).

## Requirements (all local, by design)

Runs on your Mac so the sensitive keys never enter CI:
- `keys/hovpn-private-key.pem` — the CRX signing key.
- Google Chrome — used to pack the CRX.
- SSH access to the hovpn.vip origin. Set `HOVPN_SERVER` to its SSH host alias,
  for example `HOVPN_SERVER=my-origin ./packaging/release.sh 1.0.3`.

> Why not full CI for the self-hosted deploy? It would require the extension
> signing key and the server SSH key as GitHub secrets. For a security tool,
> keeping the signing key off CI is worth the one local command — a compromised
> CI could otherwise sign a malicious auto-updating build.

## Channels & ids

| Channel      | Extension id                       | Update mechanism                 |
|--------------|------------------------------------|----------------------------------|
| Web Store    | `ifcbhfjmblebbinhgjhfmjgnkmoneifg` | Google (after review)            |
| Self-hosted  | `mbjbjjnaihiegbpjdjoflfmehppobbod` | `hovpn.vip/updates.xml` polling  |

The native host (`native-host` + both installers) trusts **both** ids, so
either install path keeps working after a release.
