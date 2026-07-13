#!/usr/bin/env node
/*! Hovpn — © 2026 Mohsen (ebmohsen.com). All rights reserved. https://hovpn.vip
 *  Proprietary. Unauthorized copying, modification, or redistribution prohibited. */
// Hovpn cross-platform installer for the native messaging host.
//
//   node install.js [chrome-extension-id]
//
// The extension ID defaults to Hovpn's own fixed ID (derived from the "key"
// baked into extension/manifest.json — see keys/EXTENSION_ID.txt) so a normal
// user never has to find and paste anything; an override is still accepted
// for local development against a differently-keyed build.
//
// It (1) ensures xray-core is present (downloads it if not), (2) writes a
// launcher that starts the host with an absolute Node path — Chrome launches
// native hosts with a minimal PATH that excludes Homebrew/nvm/etc. — and
// (3) registers the native-messaging manifest in the right place for each OS:
// a JSON file on macOS/Linux, a JSON file + HKCU registry key on Windows.
// Chrome, Chromium, Edge and Brave are all targeted best-effort.

const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const HOST_NAME = 'com.hovpn.host';
const IS_WIN = process.platform === 'win32';
const HOME = os.homedir();
const DIR = __dirname;
const DEFAULT_EXTENSION_ID = 'mbjbjjnaihiegbpjdjoflfmehppobbod';
// Also trust the Chrome Web Store build of Hovpn (different id than the
// self-hosted CRX), so the store extension can reach the same native host.
const STORE_EXTENSION_ID = 'ifcbhfjmblebbinhgjhfmjgnkmoneifg';
// Firefox add-on id (browser_specific_settings.gecko.id). Firefox native-host
// manifests use `allowed_extensions` with this id, not chrome-extension URLs.
const FIREFOX_ID = 'hovpn@hovpn.vip';

const STATE_DIR = path.join(IS_WIN ? (process.env.LOCALAPPDATA || HOME) : HOME, IS_WIN ? 'Hovpn' : '.hovpn');
const BIN_DIR = path.join(STATE_DIR, 'bin');

function resolveNode() {
  // process.execPath is the absolute path to the running Node — exactly what
  // we want baked into the launcher.
  return process.execPath;
}

function writeLauncher() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const nodeBin = resolveNode();
  const hostJs = path.join(DIR, 'xray-manager.js');

  if (IS_WIN) {
    const bat = path.join(STATE_DIR, 'hovpn-host.bat');
    // %* forwards Chrome's args; quotes handle spaces in paths.
    fs.writeFileSync(bat, `@echo off\r\n"${nodeBin}" "${hostJs}" %*\r\n`);
    return bat;
  }
  const sh = path.join(STATE_DIR, 'hovpn-host');
  fs.writeFileSync(sh, `#!/bin/bash\nexec "${nodeBin}" "${hostJs}"\n`);
  fs.chmodSync(sh, 0o755);
  return sh;
}

function manifest(extId, launcherPath) {
  // Trust the requested id plus the store build (deduped), so both the
  // self-hosted and Web Store installs reach the same host.
  const ids = [...new Set([extId, STORE_EXTENSION_ID])];
  return {
    name: HOST_NAME,
    description: 'Hovpn native host — manages a local xray-core process',
    path: launcherPath,
    type: 'stdio',
    allowed_origins: ids.map((id) => `chrome-extension://${id}/`)
  };
}

// Firefox native-host manifest: same host, but keyed by add-on id.
function firefoxManifest(launcherPath) {
  return {
    name: HOST_NAME,
    description: 'Hovpn native host — manages a local xray-core process',
    path: launcherPath,
    type: 'stdio',
    allowed_extensions: [FIREFOX_ID]
  };
}

// Firefox's native-messaging-hosts directory (macOS/Linux).
function firefoxManifestDir() {
  if (process.platform === 'darwin') {
    return path.join(HOME, 'Library', 'Application Support', 'Mozilla', 'NativeMessagingHosts');
  }
  return path.join(HOME, '.mozilla', 'native-messaging-hosts');
}

// Per-OS, per-browser NativeMessagingHosts directories (macOS/Linux).
function browserManifestDirs() {
  if (process.platform === 'darwin') {
    const base = path.join(HOME, 'Library', 'Application Support');
    return [
      ['Google/Chrome', 'Google/Chrome/NativeMessagingHosts'],
      ['Chromium', 'Chromium/NativeMessagingHosts'],
      ['Microsoft Edge', 'Microsoft Edge/NativeMessagingHosts'],
      ['Brave', 'BraveSoftware/Brave-Browser/NativeMessagingHosts']
    ].map(([label, rel]) => ({ label, dir: path.join(base, rel) }));
  }
  // Linux
  const base = path.join(HOME, '.config');
  return [
    ['Google Chrome', 'google-chrome/NativeMessagingHosts'],
    ['Chromium', 'chromium/NativeMessagingHosts'],
    ['Microsoft Edge', 'microsoft-edge/NativeMessagingHosts'],
    ['Brave', 'BraveSoftware/Brave-Browser/NativeMessagingHosts']
  ].map(([label, rel]) => ({ label, dir: path.join(base, rel) }));
}

// Windows registry hives for each Chromium-family browser.
const WIN_REG_KEYS = [
  ['Chrome', `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`],
  ['Edge', `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${HOST_NAME}`],
  ['Brave', `HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\${HOST_NAME}`],
  ['Chromium', `HKCU\\Software\\Chromium\\NativeMessagingHosts\\${HOST_NAME}`]
];

function registerPosix(manifestObj, firefoxObj) {
  const written = [];
  for (const { label, dir } of browserManifestDirs()) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${HOST_NAME}.json`), JSON.stringify(manifestObj, null, 2));
      written.push(label);
    } catch { /* browser not present / not writable — skip */ }
  }
  try {
    const fdir = firefoxManifestDir();
    fs.mkdirSync(fdir, { recursive: true });
    fs.writeFileSync(path.join(fdir, `${HOST_NAME}.json`), JSON.stringify(firefoxObj, null, 2));
    written.push('Firefox');
  } catch { /* skip */ }
  return written;
}

function registerWindows(manifestObj, firefoxObj) {
  // On Windows the manifest lives at a fixed path and each browser's registry
  // key points to it. Firefox uses its own manifest (allowed_extensions) and
  // its own registry hive.
  const written = [];
  const manifestPath = path.join(STATE_DIR, `${HOST_NAME}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifestObj, null, 2));
  for (const [label, key] of WIN_REG_KEYS) {
    try {
      execFileSync('reg', ['add', key, '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f'], { windowsHide: true });
      written.push(label);
    } catch { /* skip */ }
  }
  const ffPath = path.join(STATE_DIR, `${HOST_NAME}.firefox.json`);
  fs.writeFileSync(ffPath, JSON.stringify(firefoxObj, null, 2));
  try {
    execFileSync('reg', ['add', `HKCU\\Software\\Mozilla\\NativeMessagingHosts\\${HOST_NAME}`,
      '/ve', '/t', 'REG_SZ', '/d', ffPath, '/f'], { windowsHide: true });
    written.push('Firefox');
  } catch { /* skip */ }
  return written;
}

function ensureXray() {
  const xray = path.join(BIN_DIR, IS_WIN ? 'xray.exe' : 'xray');
  if (fs.existsSync(xray)) { console.log('xray-core already installed:', xray); return; }
  console.log('xray-core not found — downloading…');
  const r = spawnSync(process.execPath, [path.join(DIR, 'download-xray.js')], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.warn('\n⚠  Automatic xray download failed. Hovpn will still install, but you must');
    console.warn('   place an xray binary at:', xray);
    console.warn('   (download from https://github.com/XTLS/Xray-core/releases)\n');
  }
}

function main() {
  const extId = process.argv[2] || DEFAULT_EXTENSION_ID;
  if (!/^[a-p]{32}$/.test(extId)) {
    console.error('Usage: node install.js [chrome-extension-id]');
    console.error('  Defaults to Hovpn\'s own fixed ID; only pass one to target a different build.');
    process.exit(1);
  }

  console.log(`Hovpn installer — ${process.platform}/${process.arch}`);
  ensureXray();

  const launcher = writeLauncher();
  const m = manifest(extId, launcher);
  const ff = firefoxManifest(launcher);
  const written = IS_WIN ? registerWindows(m, ff) : registerPosix(m, ff);

  console.log(`\n✓ Native host registered for: ${written.length ? written.join(', ') : '(no browsers detected — dirs created anyway)'}`);
  console.log(`✓ Launcher: ${launcher}`);
  console.log(`✓ Extension ID: ${extId}`);
  console.log('\nNow fully quit and reopen your browser, then click the Hovpn icon and Connect.');
}

main();
