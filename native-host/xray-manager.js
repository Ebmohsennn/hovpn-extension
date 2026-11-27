#!/usr/bin/env node
/*! Hovpn — Copyright (C) 2026 Mohsen Ebrahimizadeh (ebmohsen.com) · https://hovpn.vip
 *  SPDX-License-Identifier: GPL-3.0-or-later · name & logo: see TRADEMARKS.md */
// Hovpn native messaging host — cross-platform (macOS, Windows, Linux).
//
// Chrome's chrome.runtime.sendNativeMessage() is one-shot: it spawns this
// process, sends one message, waits for one reply, then tears the connection
// down. So xray-core is spawned fully detached and its pid/port are persisted
// to a state file — that way xray keeps running after this script exits, and
// later "stop"/"status" invocations (fresh processes too) can find it again.

const os = require('os');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn, spawnSync } = require('child_process');

const IS_WIN = process.platform === 'win32';

// State + bundled binaries live under a single per-user directory so the
// installer and the host agree on where xray-core is, on every OS.
const STATE_DIR = path.join(
  IS_WIN ? (process.env.LOCALAPPDATA || os.homedir()) : os.homedir(),
  IS_WIN ? 'Hovpn' : '.hovpn'
);
const BIN_DIR = path.join(STATE_DIR, 'bin');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const CONFIG_FILE = path.join(STATE_DIR, 'xray-config.json');
const LOG_FILE = path.join(STATE_DIR, 'xray.log');

const XRAY_EXE = IS_WIN ? 'xray.exe' : 'xray';
// Prefer the copy the Hovpn installer placed in BIN_DIR; fall back to a
// system-wide install on PATH / common locations.
const XRAY_CANDIDATES = IS_WIN
  ? [path.join(BIN_DIR, XRAY_EXE), 'xray.exe', 'xray']
  : [path.join(BIN_DIR, XRAY_EXE), 'xray', '/opt/homebrew/bin/xray', '/usr/local/bin/xray', '/usr/bin/xray'];

// Everything in STATE_DIR is private to the user: the config holds the server
// credentials (UUID / password) and the log can name the servers you use.
function ensureDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  if (!IS_WIN) {
    try { fs.chmodSync(STATE_DIR, 0o700); } catch { /* not ours to change */ }
  }
}

// writeFileSync's `mode` only applies when the file is created, so tighten
// files left behind by older versions too.
function writePrivate(file, data) {
  fs.writeFileSync(file, data, { mode: 0o600 });
  if (!IS_WIN) {
    try { fs.chmodSync(file, 0o600); } catch { /* best effort */ }
  }
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(state) {
  ensureDir();
  writePrivate(STATE_FILE, JSON.stringify(state));
}

function clearState() {
  try { fs.unlinkSync(STATE_FILE); } catch { /* already gone */ }
}

function isAlive(pid) {
  // The pid comes from a file on disk: never signal 0, 1 or a negative pid
  // (those address whole process groups or init).
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function stopExisting() {
  const state = readState();
  if (state && isAlive(state.pid)) {
    if (IS_WIN) {
      // Windows has no process groups; taskkill /T ends the whole tree.
      try { spawnSync('taskkill', ['/PID', String(state.pid), '/T', '/F'], { windowsHide: true }); }
      catch { /* already dead */ }
    } else {
      try {
        process.kill(-state.pid, 'SIGTERM'); // negative pid = whole process group (spawned detached)
      } catch {
        try { process.kill(state.pid, 'SIGTERM'); } catch { /* already dead */ }
      }
    }
  }
  clearState();
}

function buildXrayConfig(outbound, socksPort) {
  return {
    // access: 'none' — xray's access log would otherwise record every host
    // you visit (it defaults to stdout, which is redirected to xray.log).
    log: { loglevel: 'warning', access: 'none' },
    inbounds: [{
      listen: '127.0.0.1',
      port: socksPort,
      protocol: 'socks',
      settings: { udp: true, auth: 'noauth' },
      sniffing: { enabled: true, destOverride: ['http', 'tls'] }
    }],
    outbounds: [
      { protocol: outbound.protocol, settings: outbound.settings, streamSettings: outbound.streamSettings, tag: 'proxy' },
      { protocol: 'freedom', tag: 'direct' }
    ]
  };
}

function trySpawn(bin, args, outFd) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(bin, args, {
        detached: true,
        stdio: ['ignore', outFd, outFd],
        windowsHide: true // don't flash a console window on Windows
      });
    } catch (e) {
      resolve({ ok: false, error: e.message });
      return;
    }

    let settled = false;
    child.once('error', (err) => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, error: err.message });
    });

    // Give xray a brief moment to fail fast (bad binary, bad config) before
    // we declare success and let it run detached.
    setTimeout(() => {
      if (settled) return;
      settled = true;
      if (child.exitCode !== null) {
        resolve({ ok: false, error: `xray exited immediately (code ${child.exitCode}) — check ${LOG_FILE}` });
      } else {
        child.unref();
        resolve({ ok: true, pid: child.pid });
      }
    }, 400);
  });
}

const ALLOWED_PROTOCOLS = new Set(['vmess', 'vless', 'trojan', 'shadowsocks']);

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

async function handleStart(config, socksPort) {
  // Only the extension can reach this host, but validate anyway: the outbound
  // is written straight into the xray config.
  if (!isPlainObject(config) || !ALLOWED_PROTOCOLS.has(config.protocol)) {
    return { ok: false, error: 'Unsupported or missing protocol in the server profile.' };
  }
  if (!isPlainObject(config.settings) || (config.streamSettings !== undefined && !isPlainObject(config.streamSettings))) {
    return { ok: false, error: 'Malformed server profile.' };
  }
  if (!Number.isInteger(socksPort) || socksPort < 1 || socksPort > 65535) {
    return { ok: false, error: 'SOCKS port must be a whole number between 1 and 65535 — check the extension options.' };
  }

  stopExisting();
  ensureDir();
  const xrayConfig = buildXrayConfig(config, socksPort);
  writePrivate(CONFIG_FILE, JSON.stringify(xrayConfig, null, 2));
  // Truncate on every start: the log is for diagnosing the current session,
  // not a history. Also drops any access log an older version wrote.
  const outFd = fs.openSync(LOG_FILE, 'w', 0o600);
  if (!IS_WIN) {
    try { fs.fchmodSync(outFd, 0o600); } catch { /* best effort */ }
  }

  for (const bin of XRAY_CANDIDATES) {
    const res = await trySpawn(bin, ['run', '-c', CONFIG_FILE], outFd);
    if (res.ok) {
      writeState({ pid: res.pid, port: socksPort, startedAt: Date.now(), remark: config.remark });
      return { ok: true, port: socksPort };
    }
  }

  return {
    ok: false,
    error: 'xray-core not found or failed to start. Re-run the Hovpn installer ' +
      '(native-host/install.sh or install.bat) to download it, or check ' + LOG_FILE
  };
}

function handleStop() {
  stopExisting();
  // The config holds the server credentials; don't leave it on disk while disconnected.
  try { fs.unlinkSync(CONFIG_FILE); } catch { /* already gone */ }
  return { ok: true };
}

function handleStatus() {
  const state = readState();
  if (state && isAlive(state.pid)) return { running: true, ...state };
  return { running: false };
}

// V2Ray-style subscriptions are a URL returning a base64 blob of newline-
// separated vmess/vless/trojan/ss:// links. Fetched here (not from the
// extension) so we never need broad host_permissions / fight CORS — Node
// has no notion of it.
function decodeSubscriptionBody(body) {
  const trimmed = body.trim();
  if (/^(vmess|vless|trojan|ss):\/\//i.test(trimmed)) return { ok: true, text: trimmed };
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return {
      ok: false,
      error: 'This looks like a JSON-based subscription (e.g. SIP008/sing-box), which isn\'t ' +
        'supported yet — only base64 V2Ray-style subscriptions (vmess/vless/trojan/ss links) are.'
    };
  }
  try {
    const normalized = trimmed.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return { ok: true, text: Buffer.from(padded, 'base64').toString('utf8') };
  } catch (e) {
    return { ok: false, error: 'Could not decode subscription body as base64.' };
  }
}

// Chrome rejects native-messaging replies over 1 MB, and no real subscription
// is anywhere near that, so refuse to buffer more.
const MAX_SUBSCRIPTION_BYTES = 768 * 1024;

async function readCapped(res, limit) {
  const chunks = [];
  let total = 0;
  for await (const chunk of res.body) {
    total += chunk.length;
    if (total > limit) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function handleFetchSubscription(url) {
  let parsed;
  try { parsed = new URL(String(url)); } catch { return { ok: false, error: 'Subscription URL is not a valid URL.' }; }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, error: 'Subscription URL must start with http:// or https://' };
  }

  let res;
  try {
    res = await fetch(parsed, { redirect: 'follow', signal: AbortSignal.timeout(10000) });
  } catch (e) {
    return { ok: false, error: 'Failed to fetch subscription: ' + e.message };
  }
  if (!res.ok) return { ok: false, error: `Subscription URL returned HTTP ${res.status}` };

  let body;
  try {
    body = await readCapped(res, MAX_SUBSCRIPTION_BYTES);
  } catch (e) {
    return { ok: false, error: 'Failed to read subscription: ' + e.message };
  }
  if (body === null) return { ok: false, error: 'Subscription is too large (over 768 KB).' };
  const decoded = decodeSubscriptionBody(body);
  if (!decoded.ok) return decoded;

  const links = decoded.text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^(vmess|vless|trojan|ss):\/\//i.test(l));

  if (!links.length) return { ok: false, error: 'No vmess/vless/trojan/ss links found in this subscription.' };
  return { ok: true, links };
}

// "Latency" here is TCP handshake time to the server's front address:port —
// the same proxy most V2Ray GUI clients use for a quick "ping" sort, since
// it needs no live tunnel and no ICMP privileges. It measures reachability
// of the front server, not full round-trip time through the proxied protocol.
function tcpConnectTime(address, port, timeoutMs) {
  return new Promise((resolve) => {
    // A malformed link can yield a NaN/out-of-range port or empty address;
    // socket.connect() throws synchronously on those, which would otherwise
    // reject the whole Promise.all batch and wipe every server's latency.
    const p = Number(port);
    if (!address || !Number.isInteger(p) || p < 1 || p > 65535) {
      resolve(null);
      return;
    }
    const start = Date.now();
    const socket = new net.Socket();
    let done = false;
    const finish = (ms) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ms);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(Date.now() - start));
    socket.once('timeout', () => finish(null));
    socket.once('error', () => finish(null));
    try {
      socket.connect(p, address);
    } catch {
      finish(null);
    }
  });
}

async function handlePing(targets) {
  // Each probe is independently guarded so one bad target can never reject
  // the batch — worst case that target resolves to null (shown as a timeout).
  const list = Array.isArray(targets) ? targets.filter(isPlainObject).slice(0, 500) : [];
  const results = await Promise.all(list.map(async (t) => {
    let ms = null;
    try {
      ms = await tcpConnectTime(t.address, t.port, 3000);
    } catch {
      ms = null;
    }
    return { id: t.id, ms };
  }));
  return { ok: true, results };
}

// --- native messaging framing: 4-byte little-endian length prefix + UTF-8 JSON ---

function reply(obj) {
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  process.stdout.write(Buffer.concat([header, json]), () => process.exit(0));
}

async function handleMessage(msg) {
  let res;
  try {
    if (!isPlainObject(msg)) throw new Error('malformed message');
    if (msg.cmd === 'start') res = await handleStart(msg.config, msg.socksPort);
    else if (msg.cmd === 'stop') res = handleStop();
    else if (msg.cmd === 'status') res = handleStatus();
    else if (msg.cmd === 'fetchSubscription') res = await handleFetchSubscription(msg.url);
    else if (msg.cmd === 'ping') res = await handlePing(msg.targets);
    else res = { ok: false, error: 'unknown command: ' + msg.cmd };
  } catch (e) {
    res = { ok: false, error: e.message };
  }
  reply(res);
}

let buf = Buffer.alloc(0);
let handling = false;
process.stdin.on('data', (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  while (buf.length >= 4) {
    const len = buf.readUInt32LE(0);
    if (buf.length < 4 + len) break;
    let msg = null;
    try { msg = JSON.parse(buf.slice(4, 4 + len).toString('utf8')); } catch { /* handled as malformed */ }
    buf = buf.slice(4 + len);
    handling = true;
    handleMessage(msg); // exits via reply()'s write callback once done
  }
});

// Chrome (or a test harness) may close stdin right after writing the
// request, before the async handler above finishes (e.g. handleStart's
// spawn-and-wait). Only auto-exit here if no message ever came in —
// otherwise let the in-flight handleMessage's reply() drive the exit.
process.stdin.on('end', () => {
  if (!handling) process.exit(0);
});
