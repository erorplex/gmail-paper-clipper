// Service worker: relays the Gmail tab to the Mac helper, keeps unpacked installs current, and
// brings open Gmail tabs up to date after an install or update.
const HOST = 'io.github.erorplex.paper_clipper';

// ---------- Mac helper relay ----------
// Content scripts cannot talk to native hosts, so this relays a port from the Gmail tab to the
// helper and passes replies back unchanged.

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'paper-clipper-helper') return;

  let native;
  try {
    native = chrome.runtime.connectNative(HOST);
  } catch (err) {
    port.postMessage({ ok: false, error: String((err && err.message) || err) });
    port.disconnect();
    return;
  }

  native.onMessage.addListener((message) => port.postMessage(message));
  native.onDisconnect.addListener(() => {
    const error = (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'helper exited';
    try {
      port.postMessage({ ok: false, error });
      port.disconnect();
    } catch {
      // The Gmail tab is already gone.
    }
  });
  port.onMessage.addListener((message) => native.postMessage(message));
  port.onDisconnect.addListener(() => native.disconnect());
});

// ---------- Open Gmail tabs ----------
// Content scripts only arrive with a page load. After an install or update, inject them into
// Gmail tabs that are already open; the new copy takes over from the orphaned old one.

async function injectIntoGmailTabs() {
  const [scripts] = chrome.runtime.getManifest().content_scripts;
  for (const tab of await chrome.tabs.query({ url: scripts.matches })) {
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: scripts.css });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: scripts.js });
    } catch {
      // Discarded or still loading; the manifest injects on the next load.
    }
  }
}

// ---------- Unpacked installs follow the files on disk ----------
// A git checkout kept current by update.sh changes the files, but Chrome keeps running the copy it
// loaded. Once a minute the files on disk are compared with the loaded ones; after a change the
// extension reloads itself.

const CHECK_ALARM = 'check-files';
const LOADED = 'loadedFingerprint';

function watchedFiles() {
  const manifest = chrome.runtime.getManifest();
  const scripts = manifest.content_scripts.flatMap((c) => [...(c.js || []), ...(c.css || [])]);
  return ['manifest.json', manifest.background.service_worker, ...scripts];
}

async function fingerprint() {
  const texts = await Promise.all(
    watchedFiles().map((file) =>
      fetch(chrome.runtime.getURL(file), { cache: 'no-store' })
        .then((res) => (res.ok ? res.text() : ''))
        .catch(() => '')
    )
  );
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texts.join('\0')));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function isUnpacked() {
  return (await chrome.management.getSelf()).installType === 'development';
}

async function rememberLoadedFiles() {
  if (!(await isUnpacked())) return;
  await chrome.storage.session.set({ [LOADED]: await fingerprint() });
  await chrome.alarms.create(CHECK_ALARM, { periodInMinutes: 1 });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A reload into a broken version (missing file, invalid manifest) would stop this watcher too, and a
// later fix would never arrive. So the new manifest must parse and every file it names must exist.
async function newVersionLoads() {
  try {
    const url = (file) => chrome.runtime.getURL(file);
    const manifest = await (await fetch(url('manifest.json'), { cache: 'no-store' })).json();
    const files = [
      manifest.background && manifest.background.service_worker,
      ...(manifest.content_scripts || []).flatMap((c) => [...(c.js || []), ...(c.css || [])]),
      manifest.action && manifest.action.default_popup,
      ...Object.values(manifest.icons || {}),
      manifest.default_locale && `_locales/${manifest.default_locale}/messages.json`,
    ].filter(Boolean);
    const found = await Promise.all(files.map((f) => fetch(url(f), { cache: 'no-store' }).then((r) => r.ok, () => false)));
    return found.every(Boolean);
  } catch {
    return false;
  }
}

async function reloadIfFilesChanged() {
  const { [LOADED]: loaded } = await chrome.storage.session.get(LOADED);
  if (!loaded) return rememberLoadedFiles();
  const current = await fingerprint();
  if (current === loaded) return;
  // git may still be writing files; reload only once the new state is stable.
  await wait(5000);
  if ((await fingerprint()) !== current) return;
  if (await newVersionLoads()) chrome.runtime.reload();
  else console.warn('[Paper Clipper] new files on disk are incomplete; keeping the loaded version');
}

chrome.runtime.onInstalled.addListener(async () => {
  await rememberLoadedFiles();
  await injectIntoGmailTabs();
});
chrome.runtime.onStartup.addListener(rememberLoadedFiles);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CHECK_ALARM) reloadIfFilesChanged();
});
// E.g. after the extension was disabled and enabled again, when neither event above fires.
chrome.alarms.get(CHECK_ALARM).then((alarm) => alarm || rememberLoadedFiles());
