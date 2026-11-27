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
const crypto = require('crypto');
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

// The xray-core release this installer downloads, and the SHA-256 of each
// asset as published in that release's .dgst files. Pinned on purpose: the
// binary runs as the user, so "whatever is latest" is not good enough.
// To upgrade, change XRAY_VERSION and replace every hash from
//   https://github.com/XTLS/Xray-core/releases/download/<version>/<asset>.dgst
// (keep packaging/mac/fetch-binaries.sh and the Windows workflow in step).
const XRAY_VERSION = 'v26.3.27';
const XRAY_SHA256 = {
  'Xray-macos-arm64-v8a.zip': '2e93a67e8aa1936ecefb307e120830fcbd4c643ab9b1c46a2d0838d5f8409eaf',
  'Xray-macos-64.zip': 'f5b0471d3459eff1b82e48af0aeac186abcc3298210070afbbbd8437a4e8b203',
  'Xray-windows-arm64-v8a.zip': '35d4ed6ec21224fb22b07c2c3f672e2350cd536f2c74d309150175a76365ea88',
  'Xray-windows-32.zip': '956a5ec00bce747c7936dc4ff7ac570df1c8030b0a4a8640f843488365084db3',
  'Xray-windows-64.zip': 'd004c39288ce9ada487c6f398c7c545f7d749e44bdfdd59dbc9f865afba4e1ad',
  'Xray-linux-arm64-v8a.zip': '4d30283ae614e3057f730f67cd088a42be6fdf91f8639d82cb69e48cde80413c',
  'Xray-linux-64.zip': '23cd9af937744d97776ee35ecad4972cf4b2109d1e0fe6be9930467608f7c8ae'
};

// PowerShell single-quoted strings escape a quote by doubling it.
function psQuote(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

// Unzip using whatever ships with the OS (no npm deps): PowerShell on Windows,
// `unzip` on macOS/Linux (with a `jar`/python fallback if unzip is absent).
function extract(zipPath, destDir) {
  if (IS_WIN) {
    const ps = `Expand-Archive -LiteralPath ${psQuote(zipPath)} -DestinationPath ${psQuote(destDir)} -Force`;
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
  const tag = XRAY_VERSION;
  const expected = XRAY_SHA256[asset];
  if (!expected) throw new Error(`No pinned checksum for ${asset}`);
  const url = `https://github.com/XTLS/Xray-core/releases/download/${tag}/${asset}`;
  console.log(`Downloading xray-core ${tag} (${asset})…`);

  const res = await fetch(url, { headers: { 'User-Agent': 'Hovpn-installer' }, redirect: 'follow', signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const actual = crypto.createHash('sha256').update(buf).digest('hex');
  if (actual !== expected) {
    throw new Error(`Checksum mismatch for ${asset}: expected ${expected}, got ${actual}. Nothing was installed.`);
  }
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

module.exports = { XRAY_PATH, BIN_DIR, assetName, XRAY_VERSION, XRAY_SHA256 };
