// Windows CI smoke test for the Hovpn Helper install.
// Run AFTER the installer has been executed silently. Verifies the installed
// files + registry key exist and drives the native host (framed messages) to
// confirm node + xray actually start a SOCKS proxy and stop cleanly.
// Exits non-zero on any failure so CI goes red.

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawnSync, spawn } = require('child_process');

const APP = path.join(process.env.LOCALAPPDATA || process.env.HOME, 'Hovpn');
const LAUNCHER = path.join(APP, 'hovpn-host.bat');
let failures = 0;
function check(name, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) failures++;
}

// 1. installed files
for (const rel of ['bin\\node.exe', 'bin\\xray.exe', 'hovpn-host.js', 'hovpn-host.bat', 'com.hovpn.host.json']) {
  check(`file exists: ${rel}`, fs.existsSync(path.join(APP, rel)));
}

// 2. manifest points at the launcher + fixed ext id
try {
  const m = JSON.parse(fs.readFileSync(path.join(APP, 'com.hovpn.host.json'), 'utf8'));
  check('manifest name is com.hovpn.host', m.name === 'com.hovpn.host');
  check('manifest allowed_origins set', Array.isArray(m.allowed_origins) && m.allowed_origins.length === 1);
} catch (e) {
  check('manifest parses', false);
}

// 3. registry key registered for Chrome
const reg = spawnSync('reg', ['query', 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.hovpn.host'], { encoding: 'utf8' });
check('Chrome registry key present', reg.status === 0 && /com\.hovpn\.host\.json/i.test(reg.stdout));

// 4. drive the native host (framed protocol) — start/status/stop
function callHost(msg) {
  const json = Buffer.from(JSON.stringify(msg), 'utf8');
  const header = Buffer.alloc(4); header.writeUInt32LE(json.length, 0);
  // .bat must be run via cmd.exe
  const r = spawnSync('cmd', ['/c', LAUNCHER], { input: Buffer.concat([header, json]) });
  if (!r.stdout || r.stdout.length < 4) return { _fail: true, stderr: (r.stderr || '').toString() };
  const len = r.stdout.readUInt32LE(0);
  return JSON.parse(r.stdout.slice(4, 4 + len).toString('utf8'));
}

const cfg = {
  protocol: 'vless', remark: 'ci-smoke', address: 'example.com', port: 443,
  settings: { vnext: [{ address: 'example.com', port: 443, users: [{ id: '5783a3e7-8686-4c1e-8e2b-0d2f6f5e4a11', encryption: 'none' }] }] },
  streamSettings: { network: 'tcp', security: 'none' }
};

const start = callHost({ cmd: 'start', config: cfg, socksPort: 11321 });
check('host start ok', start && start.ok === true);
const status = callHost({ cmd: 'status' });
check('host status running', status && status.running === true);

// 5. SOCKS port actually listening
const sockOk = spawnSync(process.execPath, ['-e', `
const net=require('net');
const s=net.createConnection({port:11321,host:'127.0.0.1'},()=>{console.log('OK');s.end();process.exit(0)});
s.on('error',()=>process.exit(1));
setTimeout(()=>process.exit(1),3000);
`]);
check('SOCKS port 11321 accepts connections', sockOk.status === 0);

const stop = callHost({ cmd: 'stop' });
check('host stop ok', stop && stop.ok === true);

console.log(`\n${failures === 0 ? 'ALL WINDOWS SMOKE TESTS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
