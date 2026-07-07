/*! Hovpn — © 2026 Mohsen (ebmohsen.com). All rights reserved. https://hovpn.vip
 *  Proprietary. Unauthorized copying, modification, or redistribution prohibited. */
// Service worker: owns chrome.proxy state and talks to the native host
// (native-host/xray-manager.js) which starts/stops a local xray-core process.
// Also runs a periodic background health check (chrome.alarms) so crash
// recovery doesn't depend on the popup being open.

const NATIVE_HOST = 'com.hovpn.host';
const HEALTHCHECK_ALARM = 'v2ray-healthcheck';

async function getSettings() {
  const { socksPort = 1080, bypassList = 'localhost,127.0.0.1' } =
    await chrome.storage.sync.get(['socksPort', 'bypassList']);
  return {
    socksPort,
    bypassList: bypassList.split(',').map((s) => s.trim()).filter(Boolean)
  };
}

async function setProxy(socksPort, bypassList) {
  await chrome.proxy.settings.set({
    value: {
      mode: 'fixed_servers',
      rules: {
        singleProxy: { scheme: 'socks5', host: '127.0.0.1', port: socksPort },
        bypassList
      }
    },
    scope: 'regular'
  });
}

async function clearProxy() {
  await chrome.proxy.settings.clear({ scope: 'regular' });
}

function sendNative(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(NATIVE_HOST, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(
          chrome.runtime.lastError.message +
          ' — is the native host installed? See native-host/install.sh in the README.'
        ));
      } else {
        resolve(response);
      }
    });
  });
}

function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128-on.png',
    title,
    message
  });
}

const ICONS_ON = { 16: 'icons/icon16-on.png', 48: 'icons/icon48-on.png', 128: 'icons/icon128-on.png' };
const ICONS_OFF = { 16: 'icons/icon16.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' };

// Reflects connection state on the toolbar button itself, so status is
// visible without opening the popup: green icon + green dot badge + a
// descriptive hover title when connected; plain icon and cleared badge when
// not. `kind` is 'on' | 'off' | 'error'.
async function updateToolbar(kind, label) {
  try {
    if (kind === 'on') {
      await chrome.action.setIcon({ path: ICONS_ON });
      await chrome.action.setBadgeText({ text: ' ' });
      await chrome.action.setBadgeBackgroundColor({ color: '#16a34a' });
      await chrome.action.setTitle({ title: label ? `Hovpn — Connected to ${label}` : 'Hovpn — Connected' });
    } else if (kind === 'error') {
      await chrome.action.setIcon({ path: ICONS_OFF });
      await chrome.action.setBadgeText({ text: '!' });
      await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
      await chrome.action.setTitle({ title: 'Hovpn — Problem, click to review' });
    } else {
      await chrome.action.setIcon({ path: ICONS_OFF });
      await chrome.action.setBadgeText({ text: '' });
      await chrome.action.setTitle({ title: 'Hovpn — Not connected' });
    }
  } catch {
    // setIcon can transiently fail while the SW is spinning up; non-fatal.
  }
}

// Reconciles what we *think* is happening (chrome.storage.local) with what's
// actually true (native host's status). Covers the case where xray-core died
// on its own (crash, machine sleep/wake, OS reboot reparenting gone wrong) —
// the extension would otherwise keep telling Chrome to use a SOCKS proxy
// that nothing is listening on. If we still have the outbound config for the
// active profile, try one silent restart before giving up.
async function reconcile() {
  const local = await chrome.storage.local.get([
    'connected', 'remark', 'protocol', 'address', 'activeProfileId', 'activeOutbound', 'connectedAt'
  ]);
  if (!local.connected) {
    await updateToolbar('off');
    return { connected: false };
  }

  let nativeStatus;
  try {
    nativeStatus = await sendNative({ cmd: 'status' });
  } catch (e) {
    return { connected: false, lastError: 'native host unreachable: ' + e.message };
  }

  if (nativeStatus && nativeStatus.running) {
    await updateToolbar('on', local.remark || local.address);
    return {
      connected: true,
      remark: local.remark,
      protocol: local.protocol,
      address: local.address,
      activeProfileId: local.activeProfileId,
      connectedAt: local.connectedAt
    };
  }

  if (local.activeOutbound) {
    try {
      const { socksPort, bypassList } = await getSettings();
      const restart = await sendNative({ cmd: 'start', config: local.activeOutbound, socksPort });
      if (restart && restart.ok) {
        await setProxy(socksPort, bypassList);
        await updateToolbar('on', local.remark || local.address);
        return {
          connected: true,
          remark: local.remark,
          protocol: local.protocol,
          address: local.address,
          activeProfileId: local.activeProfileId,
          connectedAt: local.connectedAt,
          repaired: true
        };
      }
    } catch {
      // fall through to marking disconnected below
    }
  }

  await clearProxy();
  await chrome.storage.local.set({ connected: false, activeProfileId: null, activeOutbound: null });
  await updateToolbar('error');
  return { connected: false, lastError: 'xray was not running and could not be restarted automatically — reconnect manually.' };
}

// Runs on a 1-minute chrome.alarms tick so crash recovery works even while
// the popup is closed. Only notifies on an actual state *transition* (not on
// every tick) so a persistently-broken connection doesn't spam the user.
async function backgroundHealthCheck() {
  const { connected, wasRunningInBackground } = await chrome.storage.local.get([
    'connected', 'wasRunningInBackground'
  ]);
  if (!connected) return;

  const result = await reconcile();
  const nowRunning = !!result.connected;

  if (wasRunningInBackground === true && !nowRunning) {
    notify('Hovpn', `Disconnected — ${result.lastError || 'xray stopped unexpectedly.'}`);
  } else if (wasRunningInBackground === false && nowRunning && result.repaired) {
    notify('Hovpn', `Reconnected automatically to ${result.remark || 'your server'}.`);
  }

  await chrome.storage.local.set({ wasRunningInBackground: nowRunning });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(HEALTHCHECK_ALARM, { periodInMinutes: 1 });
  reconcile(); // sync toolbar to whatever state we were left in
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(HEALTHCHECK_ALARM, { periodInMinutes: 1 });
  reconcile(); // after a browser restart, re-check + re-sync the toolbar icon
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEALTHCHECK_ALARM) backgroundHealthCheck();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.action === 'connect') {
        const { socksPort, bypassList } = await getSettings();
        const nativeRes = await sendNative({ cmd: 'start', config: msg.outbound, socksPort });
        if (!nativeRes || !nativeRes.ok) {
          sendResponse({ ok: false, error: (nativeRes && nativeRes.error) || 'xray failed to start' });
          return;
        }
        await setProxy(socksPort, bypassList);
        await chrome.storage.local.set({
          connected: true,
          remark: msg.outbound.remark,
          protocol: msg.outbound.protocol,
          address: msg.outbound.address,
          activeProfileId: msg.profileId || null,
          activeOutbound: msg.outbound,
          connectedAt: Date.now(),
          wasRunningInBackground: true,
          ...(msg.profileId ? { lastProfileId: msg.profileId } : {})
        });
        await updateToolbar('on', msg.outbound.remark || msg.outbound.address);
        sendResponse({ ok: true });
      } else if (msg.action === 'disconnect') {
        await sendNative({ cmd: 'stop' });
        await clearProxy();
        await chrome.storage.local.set({
          connected: false, activeProfileId: null, activeOutbound: null,
          connectedAt: null, wasRunningInBackground: false
        });
        await updateToolbar('off');
        sendResponse({ ok: true });
      } else if (msg.action === 'getStatus') {
        const result = await reconcile();
        sendResponse(result);
      } else if (msg.action === 'fetchSubscription') {
        const res = await sendNative({ cmd: 'fetchSubscription', url: msg.url });
        sendResponse(res);
      } else if (msg.action === 'ping') {
        const res = await sendNative({ cmd: 'ping', targets: msg.targets });
        sendResponse(res);
      } else {
        sendResponse({ ok: false, error: 'unknown action' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true; // keep the message channel open for the async response
});
