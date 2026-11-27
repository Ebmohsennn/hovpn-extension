#!/usr/bin/env node
/*! Hovpn — Copyright (C) 2026 Mohsen Ebrahimizadeh (ebmohsen.com) · https://hovpn.vip
 *  SPDX-License-Identifier: GPL-3.0-or-later · name & logo: see TRADEMARKS.md */
// Cross-platform xray-core fetcher. Downloads the correct prebuilt binary for
// the current OS/arch from the official XTLS/Xray-core releases and unpacks it
// into the Hovpn bin directory, so end users don't need to install xray
// themselves. macOS / Windows / Linux, x64 + arm64.

const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const IS_WIN = process.platform === 'win32';
const STATE_DIR = path.join(
  IS_WIN ? (process.env.LOCALAPPDATA || os.homedir()) : os.homedir(),
  IS_WIN ? 'Hovpn' : '.hovpn'
);
const BIN_DIR = path.join(STATE_DIR, 'bin');
const XRAY_EXE = IS_WIN ? 'xray.exe' : 'xray';
const XRAY_PATH = path.join(BIN_DIR, XRAY_EXE);

// Map Node's platform/arch to the xray release asset name.
function assetName() {
  const a = process.arch;
  if (process.platform === 'darwin') return a === 'arm64' ? 'Xray-macos-arm64-v8a.zip' : 'Xray-macos-64.zip';
  if (process.platform === 'win32') {
    if (a === 'arm64') return 'Xray-windows-arm64-v8a.zip';
    if (a === 'ia32') return 'Xray-windows-32.zip';
    return 'Xray-windows-64.zip';
  }
  if (process.platform === 'linux') return a === 'arm64' ? 'Xray-linux-arm64-v8a.zip' : 'Xray-linux-64.zip';
  throw new Error(`Unsupported platform: ${process.platform}/${a}`);
}

async function latestTag() {
  const res = await fetch('https://api.github.com/repos/XTLS/Xray-core/releases/latest', {
    headers: { 'User-Agent': 'Hovpn-installer' },
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`GitHub API returned HTTP ${res.status}`);
  const json = await res.json();
  if (!json.tag_name) throw new Error('Could not determine latest xray release');
  return json.tag_name;
}

// Unzip using whatever ships with the OS (no npm deps): PowerShell on Windows,
// `unzip` on macOS/Linux (with a `jar`/python fallback if unzip is absent).
function extract(zipPath, destDir) {
  if (IS_WIN) {
    const ps = `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`;
    const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { windowsHide: true });
    if (r.status !== 0) throw new Error('Expand-Archive failed: ' + (r.stderr || '').toString());
    return;
  }
  let r = spawnSync('unzip', ['-o', zipPath, XRAY_EXE, '-d', destDir]);
  if (r.status === 0) return;
  // Fallbacks if `unzip` isn't installed.
  r = spawnSync('python3', ['-c',
    `import zipfile,sys;zipfile.ZipFile(sys.argv[1]).extract('${XRAY_EXE}',sys.argv[2])`, zipPath, destDir]);
  if (r.status !== 0) throw new Error('Could not unzip xray (need `unzip` or python3): ' + (r.stderr || '').toString());
}

async function main() {
  const force = process.argv.includes('--force');
  if (fs.existsSync(XRAY_PATH) && !force) {
    console.log('xray already present at', XRAY_PATH);
    return;
  }
  fs.mkdirSync(BIN_DIR, { recursive: true });

  const asset = assetName();
  const tag = await latestTag();
  const url = `https://github.com/XTLS/Xray-core/releases/download/${tag}/${asset}`;
  console.log(`Downloading xray-core ${tag} (${asset})…`);

  const res = await fetch(url, { headers: { 'User-Agent': 'Hovpn-installer' }, redirect: 'follow', signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const zipPath = path.join(BIN_DIR, asset);
  fs.writeFileSync(zipPath, buf);

  extract(zipPath, BIN_DIR);
  try { fs.unlinkSync(zipPath); } catch { /* ignore */ }

  if (!fs.existsSync(XRAY_PATH)) throw new Error('xray binary not found after extraction');
  if (!IS_WIN) fs.chmodSync(XRAY_PATH, 0o755);
  console.log('xray-core installed at', XRAY_PATH);
}

if (require.main === module) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
}

module.exports = { XRAY_PATH, BIN_DIR, assetName };
