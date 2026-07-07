const portEl = document.getElementById('port');
const bypassEl = document.getElementById('bypass');
const themeEl = document.getElementById('theme');
const savedEl = document.getElementById('saved');

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'auto' ? '' : theme;
}

async function load() {
  const { socksPort = 1080, bypassList = 'localhost,127.0.0.1', theme = 'auto' } =
    await chrome.storage.sync.get(['socksPort', 'bypassList', 'theme']);
  portEl.value = socksPort;
  bypassEl.value = bypassList;
  themeEl.value = theme;
  applyTheme(theme);
}

// Live preview: retheme this page the instant the dropdown changes.
themeEl.addEventListener('change', () => applyTheme(themeEl.value));

document.getElementById('save').addEventListener('click', async () => {
  const socksPort = parseInt(portEl.value, 10) || 1080;
  const bypassList = bypassEl.value;
  const theme = themeEl.value;
  await chrome.storage.sync.set({ socksPort, bypassList, theme });
  applyTheme(theme);
  savedEl.textContent = 'Saved. Reconnect for proxy changes to take effect.';
  setTimeout(() => { savedEl.textContent = ''; }, 2500);
});

load();
