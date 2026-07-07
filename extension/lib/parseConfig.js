/*! Hovpn — © 2026 Mohsen (ebmohsen.com). All rights reserved. https://hovpn.vip
 *  Proprietary. Unauthorized copying, modification, or redistribution prohibited. */
// Parses vmess:// vless:// trojan:// ss:// share links into a structured
// outbound object shaped like an Xray-core outbound (protocol/settings/streamSettings).

function fixBase64Padding(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return str;
}

function b64decode(str) {
  return atob(fixBase64Padding(str));
}

function buildStreamSettings(network, security, opts = {}) {
  const stream = { network: network || 'tcp', security: security || 'none' };

  if (security === 'tls') {
    stream.tlsSettings = { serverName: opts.sni || opts.host || '', allowInsecure: false };
    if (opts.fp) stream.tlsSettings.fingerprint = opts.fp;
  } else if (security === 'reality') {
    stream.realitySettings = {
      serverName: opts.sni || '',
      publicKey: opts.pbk || '',
      shortId: opts.sid || '',
      fingerprint: opts.fp || 'chrome'
    };
  }

  if (stream.network === 'ws') {
    stream.wsSettings = { path: opts.path || '/', headers: opts.host ? { Host: opts.host } : {} };
  } else if (stream.network === 'grpc') {
    stream.grpcSettings = { serviceName: opts.serviceName || opts.path || '' };
  } else if (stream.network === 'h2' || stream.network === 'http') {
    stream.httpSettings = { path: opts.path || '/', host: opts.host ? [opts.host] : [] };
  } else if (stream.network === 'xhttp' || stream.network === 'splithttp') {
    stream.network = 'xhttp';
    stream.xhttpSettings = { path: opts.path || '/', host: opts.host || '', mode: opts.mode || 'auto' };
  }

  return stream;
}

function parseVmess(uri) {
  try {
    const b64 = uri.slice('vmess://'.length).split('#')[0];
    const json = JSON.parse(b64decode(b64));
    const network = json.net || 'tcp';
    const security = json.tls === 'tls' || json.tls === 'reality' ? 'tls' : 'none';
    const port = parseInt(json.port, 10);

    return {
      ok: true,
      outbound: {
        protocol: 'vmess',
        remark: json.ps || json.add,
        address: json.add,
        port,
        settings: {
          vnext: [{
            address: json.add,
            port,
            users: [{ id: json.id, alterId: parseInt(json.aid || 0, 10), security: json.scy || 'auto' }]
          }]
        },
        streamSettings: buildStreamSettings(network, security, {
          sni: json.sni, host: json.host, path: json.path, serviceName: json.path
        })
      }
    };
  } catch (e) {
    return { ok: false, error: 'Failed to parse vmess link: ' + e.message };
  }
}

function parseVless(uri) {
  try {
    const u = new URL(uri);
    const uuid = decodeURIComponent(u.username);
    const address = u.hostname;
    const port = parseInt(u.port, 10);
    const params = u.searchParams;
    const network = params.get('type') || 'tcp';
    const security = params.get('security') || 'none';
    const remark = decodeURIComponent((u.hash || '').replace(/^#/, '')) || address;

    return {
      ok: true,
      outbound: {
        protocol: 'vless',
        remark, address, port,
        settings: {
          vnext: [{
            address, port,
            users: [{ id: uuid, encryption: params.get('encryption') || 'none', flow: params.get('flow') || undefined }]
          }]
        },
        streamSettings: buildStreamSettings(network, security, {
          sni: params.get('sni'), host: params.get('host'), path: params.get('path'),
          serviceName: params.get('serviceName'), pbk: params.get('pbk'), sid: params.get('sid'),
          fp: params.get('fp'), mode: params.get('mode')
        })
      }
    };
  } catch (e) {
    return { ok: false, error: 'Failed to parse vless link: ' + e.message };
  }
}

function parseTrojan(uri) {
  try {
    const u = new URL(uri);
    const password = decodeURIComponent(u.username);
    const address = u.hostname;
    const port = parseInt(u.port, 10);
    const params = u.searchParams;
    const network = params.get('type') || 'tcp';
    const security = params.get('security') || 'tls';
    const remark = decodeURIComponent((u.hash || '').replace(/^#/, '')) || address;

    return {
      ok: true,
      outbound: {
        protocol: 'trojan',
        remark, address, port,
        settings: { servers: [{ address, port, password }] },
        streamSettings: buildStreamSettings(network, security, {
          sni: params.get('sni'), host: params.get('host'), path: params.get('path'),
          serviceName: params.get('serviceName'), pbk: params.get('pbk'), sid: params.get('sid'),
          fp: params.get('fp'), mode: params.get('mode')
        })
      }
    };
  } catch (e) {
    return { ok: false, error: 'Failed to parse trojan link: ' + e.message };
  }
}

function parseShadowsocks(uri) {
  try {
    let rest = uri.slice('ss://'.length);
    let remark = '';
    const hashIdx = rest.indexOf('#');
    if (hashIdx !== -1) {
      remark = decodeURIComponent(rest.slice(hashIdx + 1));
      rest = rest.slice(0, hashIdx);
    }

    let method, password, address, port;
    if (rest.includes('@')) {
      const [userinfo, hostport] = rest.split('@');
      const decoded = b64decode(userinfo);
      [method, password] = decoded.split(':');
      const [h, p] = hostport.split(':');
      address = h;
      port = parseInt(p, 10);
    } else {
      const decoded = b64decode(rest);
      const match = decoded.match(/^(.*?):(.*?)@(.*?):(\d+)$/);
      if (!match) throw new Error('unrecognized ss:// format');
      method = match[1];
      password = match[2];
      address = match[3];
      port = parseInt(match[4], 10);
    }

    return {
      ok: true,
      outbound: {
        protocol: 'shadowsocks',
        remark: remark || address,
        address, port,
        settings: { servers: [{ address, port, method, password }] },
        streamSettings: { network: 'tcp', security: 'none' }
      }
    };
  } catch (e) {
    return { ok: false, error: 'Failed to parse shadowsocks link: ' + e.message };
  }
}

export function parseShareLink(text) {
  const t = (text || '').trim();
  if (t.startsWith('vmess://')) return parseVmess(t);
  if (t.startsWith('vless://')) return parseVless(t);
  if (t.startsWith('trojan://')) return parseTrojan(t);
  if (t.startsWith('ss://')) return parseShadowsocks(t);
  return { ok: false, error: 'Unrecognized link — expected vmess://, vless://, trojan:// or ss://' };
}
