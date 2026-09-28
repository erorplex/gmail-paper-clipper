// Content scripts cannot talk to native hosts, so this relays a port from the Gmail tab to the
// Mac helper and passes replies back unchanged.
const HOST = 'io.github.erorplex.paper_clipper';

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
