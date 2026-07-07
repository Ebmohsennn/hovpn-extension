#!/usr/bin/env node
/*! Hovpn — © 2026 Mohsen (ebmohsen.com). All rights reserved. https://hovpn.vip
 *  Proprietary. Unauthorized copying, modification, or redistribution prohibited. */
// Hovpn cross-platform installer for the native messaging host.
//
//   node install.js <chrome-extension-id>
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
  return {
    name: HOST_NAME,
    description: 'Hovpn native host — manages a local xray-core process',
    path: launcherPath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${extId}/`]
  };
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

function registerPosix(manifestObj) {
  const written = [];
  for (const { label, dir } of browserManifestDirs()) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${HOST_NAME}.json`), JSON.stringify(manifestObj, null, 2));
      written.push(label);
    } catch { /* browser not present / not writable — skip */ }
  }
  return written;
}

function registerWindows(manifestObj) {
  // On Windows the manifest lives at a fixed path and each browser's registry
  // key points to it.
  const manifestPath = path.join(STATE_DIR, `${HOST_NAME}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifestObj, null, 2));
  const written = [];
  for (const [label, key] of WIN_REG_KEYS) {
    try {
      execFileSync('reg', ['add', key, '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f'], { windowsHide: true });
      written.push(label);
    } catch { /* skip */ }
  }
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
  const extId = process.argv[2];
  if (!extId || !/^[a-p]{32}$/.test(extId)) {
    console.error('Usage: node install.js <chrome-extension-id>');
    console.error('  The ID is the 32-letter string shown under the extension at chrome://extensions');
    process.exit(1);
  }

  console.log(`Hovpn installer — ${process.platform}/${process.arch}`);
  ensureXray();

  const launcher = writeLauncher();
  const m = manifest(extId, launcher);
  const written = IS_WIN ? registerWindows(m) : registerPosix(m);

  console.log(`\n✓ Native host registered for: ${written.length ? written.join(', ') : '(no browsers detected — dirs created anyway)'}`);
  console.log(`✓ Launcher: ${launcher}`);
  console.log(`✓ Extension ID: ${extId}`);
  console.log('\nNow fully quit and reopen your browser, then click the Hovpn icon and Connect.');
}

main();
