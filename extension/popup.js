/*! Hovpn — © 2026 Mohsen (ebmohsen.com). All rights reserved. https://hovpn.vip
 *  Proprietary. Unauthorized copying, modification, or redistribution prohibited. */
import { parseShareLink } from './lib/parseConfig.js';

// Profiles live in storage.local (a subscription can add hundreds of servers,
// past sync's 8KB-per-item quota).
const PROFILES_KEY = 'profiles';

const el = (id) => document.getElementById(id);
const heroEl = el('hero');
const heroStatusEl = el('heroStatus');
const heroSubEl = el('heroSub');
const orbIconEl = el('orbIcon');
const powerBtn = el('powerBtn');
const brandDot = el('brandDot');
const connDetail = el('connDetail');
const connProto = el('connProto');
const connSignal = el('connSignal');
const connTimer = el('connTimer');
const errorEl = el('error');
const listEl = el('profileList');
const listControlsEl = el('listControls');
const searchEl = el('search');
const sortByEl = el('sortBy');
const refreshLatencyBtn = el('refreshLatency');
const addToggle = el('addToggle');
const addForm = el('addForm');
const newName = el('newName');
const newLink = el('newLink');
const subToggle = el('subToggle');
const subForm = el('subForm');
const subLabel = el('subLabel');
const subUrl = el('subUrl');
const fetchSubBtn = el('fetchSub');

// --- orb icons ---
// AMO's linter (and general good practice) flags any `.innerHTML =` assignment
// as unsafe, even for hardcoded static markup like these icons. Parse SVG
// strings into real DOM nodes instead, and swap them in with replaceChildren.
function svgIcon(svgMarkup) {
  return new DOMParser().parseFromString(svgMarkup, 'image/svg+xml').documentElement;
}

const ICON_POWER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v9"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/></svg>';
const ICON_SHIELD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5.5c0 4.3-3 7.4-7 8.5-4-1.1-7-4.2-7-8.5V6z"/><path d="M9 12l2 2 4-4"/></svg>';
const ICON_SPINNER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 9 9" opacity="0.9"/></svg>';
const ICON_STAR_ON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>';
const ICON_STAR_OFF = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>';
const ICON_EDIT = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

// --- theme ---
(async () => {
  const { theme = 'auto' } = await chrome.storage.sync.get('theme');
  document.documentElement.dataset.theme = theme === 'auto' ? '' : theme;
})();

const addHead = el('addHead');
const subHead = el('subHead');
const saveProfileBtn = el('saveProfile');

// Edit mode: when set, the corresponding panel updates an existing item
// instead of creating a new one.
let editingProfileId = null;
let editingSubUrl = null;

function resetServerForm() {
  editingProfileId = null;
  newName.value = ''; newLink.value = '';
  addHead.classList.add('hidden');
  saveProfileBtn.textContent = 'Save server';
}
function resetSubForm() {
  editingSubUrl = null;
  subLabel.value = ''; subUrl.value = '';
  subHead.classList.add('hidden');
  fetchSubBtn.textContent = 'Fetch & import';
}

el('optionsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
addToggle.addEventListener('click', () => {
  subForm.classList.add('hidden');
  const willShow = addForm.classList.contains('hidden');
  addForm.classList.toggle('hidden');
  if (willShow) resetServerForm(); // opening fresh via the toolbar = add mode
});
subToggle.addEventListener('click', () => {
  addForm.classList.add('hidden');
  const willShow = subForm.classList.contains('hidden');
  subForm.classList.toggle('hidden');
  if (willShow) resetSubForm();
});
el('addCancel').addEventListener('click', () => { addForm.classList.add('hidden'); resetServerForm(); });
el('subCancel').addEventListener('click', () => { subForm.classList.add('hidden'); resetSubForm(); });

// Open the server panel prefilled to rename/edit an existing profile.
function openServerEdit(profile) {
  subForm.classList.add('hidden');
  editingProfileId = profile.id;
  newName.value = profile.name;
  newLink.value = profile.rawLink;
  addHead.classList.remove('hidden');
  saveProfileBtn.textContent = 'Save changes';
  addForm.classList.remove('hidden');
  newName.focus();
  newName.select();
}

// Open the subscription panel prefilled to rename/edit an existing subscription.
function openSubEdit(url, label) {
  addForm.classList.add('hidden');
  editingSubUrl = url;
  subLabel.value = label;
  subUrl.value = url;
  subHead.classList.remove('hidden');
  fetchSubBtn.textContent = 'Save changes';
  subForm.classList.remove('hidden');
  subLabel.focus();
  subLabel.select();
}

let latencies = {};         // profileId -> ms | null
let latencyTesting = false; // true while a ping batch is in flight
let timerHandle = null;
let cachedProfiles = [];
let cachedState = { connected: false };

const getProfiles = async () => (await chrome.storage.local.get(PROFILES_KEY))[PROFILES_KEY] || [];
const setProfiles = (p) => chrome.storage.local.set({ [PROFILES_KEY]: p });
const getState = () => chrome.runtime.sendMessage({ action: 'getStatus' });

function safeHostname(url) { try { return new URL(url).hostname; } catch { return url; } }

function formatDuration(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function protocolOf(profile) {
  const parsed = parseShareLink(profile.rawLink);
  return parsed.ok ? parsed.outbound.protocol : null;
}

function chipEl(protocol) {
  const c = document.createElement('span');
  c.className = 'chip' + (protocol ? ` proto-${protocol}` : '');
  const label = { vless: 'VLESS', vmess: 'VMESS', trojan: 'TROJAN', shadowsocks: 'SS' }[protocol] || '?';
  c.textContent = label;
  return c;
}

// Builds a 4-bar signal indicator from a latency in ms.
// undefined = not yet tested, null = timeout/unreachable, number = ms.
function signalEl(ms, { testing = false, showMs = true } = {}) {
  const wrap = document.createElement('span');
  wrap.className = 'signal';
  const bars = [];
  for (let i = 0; i < 4; i++) {
    const b = document.createElement('span');
    b.className = 'bar';
    wrap.appendChild(b);
    bars.push(b);
  }

  if (testing) { wrap.classList.add('testing'); return wrap; }

  let level = 0, color = '';
  if (ms === undefined) {
    wrap.dataset.level = '0';
    return wrap; // faint, no text
  } else if (ms === null) {
    wrap.classList.add('dead');
    if (showMs) { const t = document.createElement('span'); t.className = 'ms'; t.textContent = 'timeout'; wrap.appendChild(t); }
    return wrap;
  } else {
    if (ms < 120) { level = 4; color = 'good'; }
    else if (ms < 250) { level = 3; color = 'good'; }
    else if (ms < 500) { level = 2; color = 'ok'; }
    else { level = 1; color = 'weak'; }
  }
  wrap.classList.add(color);
  wrap.dataset.level = String(level);
  for (let i = 0; i < level; i++) bars[i].classList.add('on');
  if (showMs) { const t = document.createElement('span'); t.className = 'ms'; t.textContent = `${ms} ms`; wrap.appendChild(t); }
  return wrap;
}

// --- hero state machine ---
function setOrbIcon(kind) {
  orbIconEl.replaceChildren(svgIcon(kind === 'on' ? ICON_SHIELD : kind === 'connecting' ? ICON_SPINNER : ICON_POWER));
}

function setHeroConnecting(name) {
  if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
  heroEl.className = 'hero state-connecting';
  setOrbIcon('connecting');
  heroStatusEl.textContent = 'Connecting…';
  heroSubEl.textContent = name || '';
  connDetail.classList.add('hidden');
  brandDot.classList.remove('on');
}

function renderHero(state) {
  if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }

  if (state.connected) {
    heroEl.className = 'hero state-on';
    setOrbIcon('on');
    powerBtn.setAttribute('aria-label', 'Disconnect');
    heroStatusEl.textContent = 'Protected';
    heroSubEl.textContent = state.remark || state.address || 'Connected';
    brandDot.classList.add('on');

    // connection detail: protocol chip + signal + live timer
    connProto.className = 'chip' + (state.protocol ? ` proto-${state.protocol}` : '');
    connProto.textContent = { vless: 'VLESS', vmess: 'VMESS', trojan: 'TROJAN', shadowsocks: 'SS' }[state.protocol] || '';
    connSignal.replaceChildren();
    connSignal.appendChild(signalEl(latencies[state.activeProfileId], { showMs: true }));
    connDetail.classList.remove('hidden');

    const tick = () => { connTimer.textContent = state.connectedAt ? formatDuration(Date.now() - state.connectedAt) : ''; };
    tick();
    if (state.connectedAt) timerHandle = setInterval(tick, 1000);
    if (state.repaired) heroSubEl.textContent += ' · auto-restarted';
  } else if (state.lastError) {
    heroEl.className = 'hero state-error';
    setOrbIcon('error');
    powerBtn.setAttribute('aria-label', 'Retry');
    heroStatusEl.textContent = 'Disconnected';
    heroSubEl.textContent = state.lastError;
    connDetail.classList.add('hidden');
    brandDot.classList.remove('on');
  } else {
    heroEl.className = 'hero state-off';
    setOrbIcon('off');
    powerBtn.setAttribute('aria-label', 'Connect');
    heroStatusEl.textContent = 'Not connected';
    heroSubEl.textContent = 'Tap the button to connect';
    connDetail.classList.add('hidden');
    brandDot.classList.remove('on');
  }
}

// --- connect / disconnect ---
async function connectToProfile(profile) {
  const parsed = parseShareLink(profile.rawLink);
  if (!parsed.ok) throw new Error(parsed.error);
  const res = await chrome.runtime.sendMessage({
    action: 'connect', outbound: parsed.outbound, rawLink: profile.rawLink, profileId: profile.id
  });
  if (!res.ok) throw new Error(res.error || 'Failed to connect');
}
async function disconnect() {
  const res = await chrome.runtime.sendMessage({ action: 'disconnect' });
  if (!res.ok) throw new Error(res.error || 'Failed to disconnect');
}

function pickQuickConnectTarget(profiles, lastProfileId) {
  if (!profiles.length) return null;
  const byId = (id) => profiles.find((p) => p.id === id);
  if (lastProfileId && byId(lastProfileId)) return byId(lastProfileId);
  const favs = profiles.filter((p) => p.favorite);
  const pool = favs.length ? favs : profiles;
  const withLat = pool.filter((p) => latencies[p.id] != null);
  if (withLat.length) return withLat.reduce((best, p) => (latencies[p.id] < latencies[best.id] ? p : best));
  return pool[0];
}

powerBtn.addEventListener('click', async () => {
  errorEl.textContent = '';
  powerBtn.disabled = true;
  try {
    const state = await getState();
    if (state.connected) {
      await disconnect();
    } else {
      const profiles = await getProfiles();
      const { lastProfileId } = await chrome.storage.local.get('lastProfileId');
      const target = pickQuickConnectTarget(profiles, lastProfileId);
      if (!target) { errorEl.textContent = 'Add a server first'; return; }
      setHeroConnecting(target.name);
      await connectToProfile(target);
    }
  } catch (e) {
    errorEl.textContent = e.message;
  } finally {
    powerBtn.disabled = false;
    render();
  }
});

// --- profile CRUD ---
saveProfileBtn.addEventListener('click', async () => {
  errorEl.textContent = '';
  const link = newLink.value.trim();
  if (!link) { errorEl.textContent = 'Paste a share link first'; return; }
  const parsed = parseShareLink(link);
  if (!parsed.ok) { errorEl.textContent = parsed.error; return; }
  const name = newName.value.trim() || parsed.outbound.remark || parsed.outbound.address;
  const profiles = await getProfiles();

  if (editingProfileId) {
    const p = profiles.find((x) => x.id === editingProfileId);
    if (p) {
      // If the edited profile is the live connection and its link changed,
      // drop the connection so a stale tunnel isn't left running.
      const state = await getState();
      if (state.connected && state.activeProfileId === p.id && p.rawLink !== link) {
        await chrome.runtime.sendMessage({ action: 'disconnect' });
      }
      p.name = name;
      p.rawLink = link;
      delete latencies[p.id]; // force a re-test since the endpoint may have changed
    }
  } else {
    profiles.push({ id: crypto.randomUUID(), name, rawLink: link, subscriptionUrl: null, favorite: false });
  }

  await setProfiles(profiles);
  addForm.classList.add('hidden');
  resetServerForm();
  render().then(() => testLatency(cachedProfiles));
});

async function importSubscription(url, label) {
  const res = await chrome.runtime.sendMessage({ action: 'fetchSubscription', url });
  if (!res.ok) throw new Error(res.error || 'Failed to fetch subscription');

  const resolvedLabel = label || safeHostname(url);
  const profiles = await getProfiles();
  const existingFavs = new Map(profiles.filter((p) => p.subscriptionUrl === url).map((p) => [p.rawLink, p.favorite]));

  const imported = [];
  let skipped = 0;
  res.links.forEach((link, i) => {
    const parsed = parseShareLink(link);
    if (parsed.ok) {
      imported.push({
        id: crypto.randomUUID(),
        name: parsed.outbound.remark || `${resolvedLabel} ${i + 1}`,
        rawLink: link, subscriptionUrl: url, subscriptionLabel: resolvedLabel,
        favorite: existingFavs.get(link) || false
      });
    } else { skipped++; }
  });
  if (!imported.length) throw new Error('No valid links found in this subscription');

  const state = await getState();
  const active = profiles.find((p) => p.id === state.activeProfileId);
  if (state.connected && active && active.subscriptionUrl === url) {
    await chrome.runtime.sendMessage({ action: 'disconnect' });
  }
  await setProfiles([...profiles.filter((p) => p.subscriptionUrl !== url), ...imported]);
  errorEl.textContent = skipped ? `Imported ${imported.length}, skipped ${skipped} unrecognized line(s)` : '';
}

fetchSubBtn.addEventListener('click', async () => {
  errorEl.textContent = '';
  const url = subUrl.value.trim();
  if (!url) { errorEl.textContent = 'Paste a subscription URL first'; return; }
  if (!/^https?:\/\//i.test(url)) { errorEl.textContent = 'URL must start with http:// or https://'; return; }
  fetchSubBtn.disabled = true; fetchSubBtn.textContent = editingSubUrl ? 'Saving…' : 'Fetching…';
  try {
    if (editingSubUrl && editingSubUrl === url) {
      // URL unchanged — this is a pure label rename, so don't hit the network
      // (the provider might be down and the rename should still work).
      const label = subLabel.value.trim() || safeHostname(url);
      const profiles = await getProfiles();
      for (const p of profiles) if (p.subscriptionUrl === url) p.subscriptionLabel = label;
      await setProfiles(profiles);
    } else {
      // New subscription, or an edit that changed the URL: drop the old group
      // (if any) then fetch the new one.
      if (editingSubUrl && editingSubUrl !== url) {
        const profiles = await getProfiles();
        await setProfiles(profiles.filter((p) => p.subscriptionUrl !== editingSubUrl));
      }
      await importSubscription(url, subLabel.value.trim());
    }
    subForm.classList.add('hidden'); resetSubForm();
  } catch (e) {
    errorEl.textContent = e.message;
  } finally {
    fetchSubBtn.disabled = false;
    fetchSubBtn.textContent = editingSubUrl ? 'Save changes' : 'Fetch & import';
    render().then(() => testLatency(cachedProfiles));
  }
});

// --- latency ---
async function testLatency(profiles) {
  const targets = profiles.map((p) => {
    const parsed = parseShareLink(p.rawLink);
    return parsed.ok ? { id: p.id, address: parsed.outbound.address, port: parsed.outbound.port } : null;
  }).filter(Boolean);
  if (!targets.length) return;

  latencyTesting = true;
  renderList();
  try {
    const res = await chrome.runtime.sendMessage({ action: 'ping', targets });
    if (res && res.ok) for (const r of res.results) latencies[r.id] = r.ms;
  } finally {
    latencyTesting = false;
    renderList();
    // refresh the hero's signal chip too if connected
    if (cachedState.connected) renderHero(cachedState);
  }
}

refreshLatencyBtn.addEventListener('click', async () => {
  refreshLatencyBtn.disabled = true;
  try { await testLatency(await getProfiles()); }
  finally { refreshLatencyBtn.disabled = false; }
});

searchEl.addEventListener('input', () => renderList());
sortByEl.addEventListener('change', () => renderList());

// --- list rendering ---
function rowEl(profile, state) {
  const isActive = state.connected && state.activeProfileId === profile.id;
  const row = document.createElement('div');
  row.className = 'row' + (isActive ? ' active' : '');

  const star = document.createElement('button');
  star.type = 'button';
  star.className = 'star' + (profile.favorite ? ' on' : '');
  star.title = profile.favorite ? 'Unfavorite' : 'Favorite';
  star.replaceChildren(svgIcon(profile.favorite ? ICON_STAR_ON : ICON_STAR_OFF));
  star.addEventListener('click', async (e) => {
    e.stopPropagation();
    const profiles = await getProfiles();
    const p = profiles.find((x) => x.id === profile.id);
    if (p) p.favorite = !p.favorite;
    await setProfiles(profiles);
    renderList(profiles, state);
  });
  row.appendChild(star);

  // row-main takes the whole width (minus the star): the name gets a full-width
  // line of its own (wrapping up to 2 lines), and the meta line below carries
  // the chip, signal, and the action/delete buttons — so even long RTL names
  // stay readable instead of being squeezed by a trailing Connect button.
  const main = document.createElement('div');
  main.className = 'row-main';
  const nm = document.createElement('div');
  nm.className = 'row-name';
  nm.textContent = profile.name;
  nm.title = profile.name;
  main.appendChild(nm);

  const meta = document.createElement('div');
  meta.className = 'row-meta';
  meta.appendChild(chipEl(protocolOf(profile)));
  const testing = latencyTesting && latencies[profile.id] === undefined;
  meta.appendChild(signalEl(latencies[profile.id], { testing, showMs: true }));

  const spacer = document.createElement('span');
  spacer.className = 'row-spacer';
  meta.appendChild(spacer);

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'row-edit';
  edit.title = 'Rename / edit';
  edit.replaceChildren(svgIcon(ICON_EDIT));
  edit.addEventListener('click', (e) => { e.stopPropagation(); openServerEdit(profile); });
  meta.appendChild(edit);

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'row-action';
  action.textContent = isActive ? 'Disconnect' : 'Connect';
  action.addEventListener('click', async (e) => {
    e.stopPropagation();
    errorEl.textContent = '';
    action.disabled = true;
    try {
      if (isActive) await disconnect();
      else { setHeroConnecting(profile.name); await connectToProfile(profile); }
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      action.disabled = false;
      render();
    }
  });
  meta.appendChild(action);

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'row-del';
  del.textContent = '✕';
  del.title = 'Delete';
  del.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (isActive) await disconnect();
    const profiles = await getProfiles();
    await setProfiles(profiles.filter((p) => p.id !== profile.id));
    render();
  });
  meta.appendChild(del);

  main.appendChild(meta);
  row.appendChild(main);
  return row;
}

const ICO_PIN = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h6v6H9z"/></svg>';
const ICO_RSS = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1.4" fill="currentColor" stroke="none"/></svg>';

// Header for the "Individual servers" card (no per-group actions).
function sectionHeadEl(title, count) {
  const h = document.createElement('div');
  h.className = 'section-head';
  const ico = document.createElement('span');
  ico.className = 'section-ico'; ico.replaceChildren(svgIcon(ICO_PIN));
  const t = document.createElement('span');
  t.className = 'section-title'; t.textContent = title;
  const c = document.createElement('span');
  c.className = 'count'; c.textContent = String(count);
  h.append(ico, t, c);
  return h;
}

// Header for a subscription card: rss icon, label, count, refresh/remove.
function subHeaderEl(url, members) {
  const label = members[0].subscriptionLabel || safeHostname(url);
  const h = document.createElement('div');
  h.className = 'section-head';

  const ico = document.createElement('span');
  ico.className = 'section-ico'; ico.replaceChildren(svgIcon(ICO_RSS));
  const lab = document.createElement('span');
  lab.className = 'section-title'; lab.textContent = label; lab.title = url;
  const c = document.createElement('span');
  c.className = 'count'; c.textContent = String(members.length);
  const spacer = document.createElement('span');
  spacer.className = 'spacer';
  h.append(ico, lab, c, spacer);

  const edit = document.createElement('button');
  edit.type = 'button'; edit.className = 'mini-btn'; edit.textContent = 'Edit';
  edit.addEventListener('click', () => openSubEdit(url, label));
  h.appendChild(edit);

  const refresh = document.createElement('button');
  refresh.type = 'button'; refresh.className = 'mini-btn'; refresh.textContent = 'Refresh';
  refresh.addEventListener('click', async () => {
    errorEl.textContent = ''; refresh.disabled = true;
    try { await importSubscription(url, label); }
    catch (e) { errorEl.textContent = e.message; }
    finally { refresh.disabled = false; render().then(() => testLatency(cachedProfiles)); }
  });
  h.appendChild(refresh);

  const remove = document.createElement('button');
  remove.type = 'button'; remove.className = 'mini-btn danger'; remove.textContent = 'Remove';
  remove.addEventListener('click', async () => {
    const state = await getState();
    if (state.connected && members.some((p) => p.id === state.activeProfileId)) {
      await chrome.runtime.sendMessage({ action: 'disconnect' });
    }
    const profiles = await getProfiles();
    await setProfiles(profiles.filter((p) => p.subscriptionUrl !== url));
    render();
  });
  h.appendChild(remove);
  return h;
}

function sortProfiles(list, sortBy) {
  const arr = [...list];
  if (sortBy === 'latency') {
    arr.sort((a, b) => {
      const la = latencies[a.id], lb = latencies[b.id];
      if (la == null && lb == null) return a.name.localeCompare(b.name);
      if (la == null) return 1;
      if (lb == null) return -1;
      return la - lb;
    });
  } else if (sortBy === 'name') {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    arr.sort((a, b) => (Number(b.favorite) - Number(a.favorite)) || a.name.localeCompare(b.name));
  }
  return arr;
}

async function renderList(profiles = cachedProfiles, state = cachedState) {
  cachedProfiles = profiles; cachedState = state;
  const query = searchEl.value.trim().toLowerCase();
  const sortBy = sortByEl.value;

  listEl.replaceChildren();
  if (profiles.length === 0) {
    listControlsEl.classList.add('hidden');
    const empty = document.createElement('div');
    empty.className = 'profile-empty';
    const big = document.createElement('span');
    big.className = 'big';
    big.textContent = '🛰️';
    empty.append(
      big,
      document.createTextNode('No servers yet.'),
      document.createElement('br'),
      document.createTextNode('Add one below to get started.')
    );
    listEl.appendChild(empty);
    return;
  }
  listControlsEl.classList.remove('hidden');

  const matches = (p) => !query || p.name.toLowerCase().includes(query);
  const manual = sortProfiles(profiles.filter((p) => !p.subscriptionUrl && matches(p)), sortBy);
  const groups = new Map();
  for (const p of profiles) {
    if (!p.subscriptionUrl) continue;
    if (!groups.has(p.subscriptionUrl)) groups.set(p.subscriptionUrl, []);
    groups.get(p.subscriptionUrl).push(p);
  }

  const hasSubs = groups.size > 0;
  let shown = 0;

  if (manual.length) {
    const g = document.createElement('div');
    g.className = 'group';
    // Only label the individual-servers card when there are also subscriptions
    // to distinguish it from; on its own it needs no header.
    if (hasSubs) g.appendChild(sectionHeadEl('Individual servers', manual.length));
    for (const p of manual) { g.appendChild(rowEl(p, state)); shown++; }
    listEl.appendChild(g);
  }

  for (const [url, allMembers] of groups) {
    const members = sortProfiles(allMembers.filter(matches), sortBy);
    if (!members.length) continue;
    const g = document.createElement('div');
    g.className = 'group';
    g.appendChild(subHeaderEl(url, allMembers));
    for (const p of members) { g.appendChild(rowEl(p, state)); shown++; }
    listEl.appendChild(g);
  }

  if (shown === 0) {
    const empty = document.createElement('div');
    empty.className = 'profile-empty';
    empty.textContent = 'No servers match your search.';
    listEl.appendChild(empty);
  }
}

async function render() {
  const [profiles, state] = await Promise.all([getProfiles(), getState()]);
  renderHero(state);
  await renderList(profiles, state);
}

render().then(() => testLatency(cachedProfiles));
