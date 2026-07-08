# Automatic Chrome Web Store publishing

Once set up, publishing is automatic: **bump the version in
`extension/manifest.json` and push to `main`** — GitHub Actions
(`.github/workflows/publish-webstore.yml`) uploads the new build and submits
it for review. (You can also trigger it manually from the Actions tab → "Run
workflow".)

> Google **reviews every upload**. "Published" means it goes live *after*
> review passes (usually minutes to a day), not instantly.

## One-time setup (you do this once)

The Chrome Web Store API needs OAuth2 credentials from the Google account that
**owns the Hovpn item** — a **service account does not work** for this API.

### 1. Enable the API
- Go to https://console.cloud.google.com → create/select a project.
- APIs & Services → Library → search **"Chrome Web Store API"** → **Enable**.

### 2. Configure the consent screen
- APIs & Services → OAuth consent screen → **External** → fill the basics.
- Add your own Google account under **Test users** (so you can authorize it).

### 3. Create OAuth credentials
- APIs & Services → Credentials → Create credentials → **OAuth client ID** →
  Application type **Desktop app**.
- Copy the **Client ID** and **Client secret**.

### 4. Get a refresh token
Run locally (needs Node 18+):

```bash
node packaging/webstore/get-refresh-token.js <client_id> <client_secret>
```

It opens your browser — approve with the account that owns the item. It prints
a **refresh token**. (Run it on your own machine; never commit the output.)

### 5. Add three GitHub secrets
In the GitHub repo → Settings → Secrets and variables → Actions → New
repository secret:

| Secret name          | Value                     |
|----------------------|---------------------------|
| `CWS_CLIENT_ID`      | the OAuth client ID       |
| `CWS_CLIENT_SECRET`  | the OAuth client secret   |
| `CWS_REFRESH_TOKEN`  | the refresh token from step 4 |

That's it. The item id (`ifcbhfjmblebbinhgjhfmjgnkmoneifg`) is public and is
already set in the workflow.

## How releases work after setup

- Bump `extension/manifest.json` `version` (e.g. `1.0.1` → `1.0.2`).
- Commit + push to `main`.
- The workflow detects the version change, rebuilds the store zip (with the
  `key` stripped), uploads it to the item, and publishes → review → live.
- Pushes that don't change the version are ignored (no accidental publishes).

## Note on the self-hosted path

This only publishes the **Web Store** copy. The **self-hosted** copy
(`hovpn.vip/download/hovpn.crx` + `updates.xml`) is updated separately — bump
its `version` in `updates.xml` and re-upload the rebuilt `.crx`. The
`native-host` trusts both builds' ids, so both stay working.
